const mqNode = require('mq-node');
const _ = require('lodash');

function annotateWkbTypes(geometry, buffer, annotateOffset) {
    let offset = annotateOffset;
    if (!buffer) {
        return offset;
    }
    const byteOrder = buffer.readUInt8(offset);
    offset += 1;
    const ignorePoints = function (count) {
        offset += count * 16;
    };

    function readInt() {
        const result = byteOrder ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
        offset += 4;
        return result;
    }

    geometry._wkbType = readInt();

    if (geometry._wkbType === 1) {
        ignorePoints(1);
    }
    else if (geometry._wkbType === 2) {
        ignorePoints(readInt());
    }
    else if (geometry._wkbType === 3) {
        const rings = readInt();
        for (let i = 0; i < rings; i++) {
            ignorePoints(readInt());
        }
    }
    else if (geometry._wkbType === 7) {
        const elements = readInt();
        for (let i = 0; i < elements; i++) {
            offset = annotateWkbTypes(geometry[i], buffer, offset);
        }
    }
    return offset;
}

function isset(...args) {
    if (!args.length) {
        throw new Error('Empty isset');
    }
    return [].reduce.call(args, (isset, arg) => !(arg === undefined || arg === null) && isset, true);
}

function escapeGeometryType(val) {
    const constructors = {
        1: 'POINT',
        2: 'LINESTRING',
        3: 'POLYGON',
        4: 'MULTIPOINT',
        5: 'MULTILINESTRING',
        6: 'MULTIPOLYGON',
        7: 'GEOMETRYCOLLECTION'
    };

    function isPointType(val) {
        return val && typeof val.x === 'number' && typeof val.y === 'number';
    }
    function close(str) {
        return str.length && str[0] === '(' ? str : `(${str})`;
    }
    function escape(val) {
        let result = isPointType(val)
            ? (`${val.x} ${val.y}`)
            : `(${val.map(escape).join(',')})`;
        if (val._wkbType) {
            result = constructors[val._wkbType] + close(result);
        }
        return result;
    }

    return `GeomFromText('${escape(val)}')`;
}

function buildInsert(mysql, rows, table) {
    const cols = _.keys(rows[0]);
    const sql = [];
    for (const i in rows) {
        if (rows.hasOwnProperty(i)) {
            const values = [];
            for (const k in rows[i]) {
                if (typeof rows[i][k] === 'function') {
                    continue;
                }
                if (!isset(rows[i][k])) {
                    if (rows[i][k] === null) {
                        values.push('NULL');
                    }
                    else {
                        values.push(' ');
                    }
                }
                else if (rows[i][k] !== '') {
                    if (rows[i][k]._wkbType) {
                        const geometry = escapeGeometryType(rows[i][k]);
                        values.push(geometry);
                    }
                    else if (typeof rows[i][k] === 'number') {
                        values.push(rows[i][k]);
                    }
                    else {
                        values.push(mysql.escape(rows[i][k]));
                    }
                }
                else {
                    values.push('\'\'');
                }
            }
            sql.push(`INSERT INTO \`${table}\` (\`${cols.join('`,`')}\`) VALUES (${values.join()});`);
        }
    }
    return sql.join('\n');
}

async function getTables(mysql, options) {
    return new Promise(function (resolve, reject) {
        if (!options.tables || !options.tables.length) {
            mysql.query(`SHOW TABLES FROM \`${options.database}\``, (err, data) => {
                err ? reject(err) : resolve(data.map(table => table[`Tables_in_${options.database}`]));
            });
        }
        else {
            resolve(options.tables);
        }
    });
}

async function createSchemaDump(mysql, options, tables) {
    if (!options.schema) {
        return;
    }
    const data = await Promise.all(
        tables.map(table =>
            new Promise(function (resolve, reject) {
                mysql.query(`SHOW CREATE TABLE \`${table}\``, function (err, data) {
                    err ? reject(err) : resolve(data);
                });
            })
        )
    );
    const res = [];
    for (const i in data) {
        if (data.hasOwnProperty(i)) {
            let r = `${data[i][0]['Create Table']};`;
            if (options.dropTable) {
                r = r.replace(/CREATE TABLE `/, `DROP TABLE IF EXISTS \`${data[i][0].Table}\`;\nCREATE TABLE \``);
            }
            if (options.ifNotExist) {
                r = r.replace(/CREATE TABLE `/, 'CREATE TABLE IF NOT EXISTS `');
            }
            if (!options.autoIncrement) {
                r = r.replace(/AUTO_INCREMENT=\d+ /g, '');
            }
            res.push(r);
        }
    }
    return res;
}

async function createDataDump(mysql, options, tables) {
    const target = options.data ? tables : options.where ? Object.keys(options.where) : null;
    if (!target) {
        return;
    }

    const typeCastOptions = {
        typeCast(field, next) {
            if (field.type === 'GEOMETRY') {
                const offset = field.parser._offset;
                const buffer = field.buffer();
                field.parser._offset = offset;
                const result = field.geometry();
                annotateWkbTypes(result, buffer, 4);
                return result;
            }
            return next();
        }
    };

    return await Promise.all(target.map(table => new Promise(function (resolve, reject) {
        const opts = {
            cols: '*',
            from: `\`${table}\``
        };
        if (options.where && (typeof options.where[table] !== 'undefined')) {
            opts.where = options.where[table];
        }
        mysql.select(
            opts,
            function (err, data) {
                err ? reject(err) : resolve(buildInsert(mysql, data, table));
            },
            typeCastOptions
        );
    })));
}

function getDump(dump = {
    schema: [],
    data: []
}) {
    return [].concat(dump.schema).concat(dump.data).join('\n\n');
}

exports = module.exports = async function (options = {
    // default connection
    host: 'localhost',
    user: 'root',
    password: '',
    database: null,
    // default option
    tables: null,
    schema: true,
    data: true,
    ifNotExist: true,
    autoIncrement: true,
    dropTable: false,
    where: null
}) {
    const connectionOptions = ['host', 'user', 'password', 'database', 'port', 'socketPath'];
    const defaultConnection = _.pick(options, connectionOptions);

    if (!options.database) {
        throw new Error('Database not specified');
    }

    const mysql = mqNode(defaultConnection);

    const tables = await getTables(mysql, options);
    const schema = await createSchemaDump(mysql, options, tables);
    const data = await createDataDump(mysql, options, tables);
    const dump = getDump({
        data,
        schema
    });
    return dump;
}
