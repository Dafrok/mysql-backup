# Mysql Backup

Create a backup from MySQL.
A modern version of [mysqldump](https://github.com/webcaetano/mysqldump), but it's not to create a file, to output a string instead.

## Installation

```
npm install mysql-backup
```

## Get Start

## Example

```javascript
const mysqlBackup = require('mysql-backup');

mysqlBackup({
	host: 'localhost',
	user: 'root',
	password: '',
	database: 'test',
}).then(dump => {
	console.log(dump);
})
```

### Full Options Example

```javascript
var mysqlDump = require('mysqldump');
var fs = require('fs');

mysqlDump({
	host: 'localhost',
	user: 'root',
	password: '',
	database: 'test',
	tables:['players'], // only these tables
	where: {'players': 'id < 1000'}, // Only test players with id < 1000
	ifNotExist:true, // Create table if not exist
}.then(dump => {
	fs.writeFileSync('test.sql', dump); // Create data.sql file with dump result
})
```

## Options


#### host

Type: `String`

Url to Mysql host. `Default: localhost`

#### port

Type: `String`

Port to Mysql host. `Default: 3306`

#### user

Type: `String`

The MySQL user to authenticate as.

#### password

Type: `String`

The password of that MySQL user

#### database

Type: `String`

Name of the database to dump.

#### tables 

Type: `Array`

Array of tables that you want to backup.

Leave Blank for All. `Default: [] ALL`

#### schema 

Type: `Boolean`

Output table structure `Default: true`;

#### data 

Type: `Boolean`

Output table data for ALL tables `Default: true`;

#### where
Type: `Object`

Where clauses to limit dumped data `Example: where: {'users': 'id < 1000'}`

Combine with `data: false` to only dump tables with where clauses  `Default: null`;

#### ifNotExist 

Type: `Boolean`

Create tables if not exist method `Default: true`;

#### dropTable 

Type: `Boolean`

Drop tables if exist `Default: false`;

#### getDump 

Type: `Boolean`

Return dump as a raw data on callback instead of create file `Default: false`;

#### socketPath

Type: `String`

Path to a unix domain socket to connect to. When used `host` and `port` are ignored.

[![npm](https://nodei.co/npm/mysql-backup.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/mysql-backup)

---------------------------------

The MIT [License](https://raw.githubusercontent.com/webcaetano/mysqldump/master/LICENSE.md)
