module.exports = function(db, logFN, cb)
{
	var async = require('async');

	var tables = {};

	tables.asn = 'CREATE TABLE `asn` (`start`	BLOB, `end`	BLOB, `version`	INTEGER, `as_num`	TEXT, `name`	TEXT, PRIMARY KEY(start,end));';
	tables.geo_blocks = 'CREATE TABLE `geo_blocks` (`start`	BLOB, `end`	BLOB, `version`	INTEGER, `geoname_id`	INTEGER, `registered_country_geoname_id`	INTEGER, `represented_country_geoname_id`	INTEGER, `is_anonymous_proxy`	INTEGER, `is_satellite_provider`	INTEGER, `postal_code`	TEXT, `latitude`	NUMERIC, `longitude`	NUMERIC, `accuracy_radius`	INTEGER,\ PRIMARY KEY(start,end));';
	tables.geo_names = 'CREATE TABLE `geo_names` (`geoname_id`	INTEGER, `locale_code`	TEXT, `continent_code`	TEXT, `country_iso_code`	TEXT, `subdivision_1_iso_code`	TEXT, `subdivision_2_iso_code`	TEXT, `metro_code`	TEXT, `time_zone`	TEXT, PRIMARY KEY(geoname_id));';
	tables.lang = 'CREATE TABLE `lang` (`field`	TEXT, `code`	TEXT, `de`	TEXT, `en`	TEXT, `es`	TEXT, `fr`	INTEGER, `ja`	INTEGER, `pt-BR`	INTEGER, `ru`	INTEGER, `zh-CN`	INTEGER, PRIMARY KEY(field,code));';

	async.eachOfSeries(tables, function(value, key, callback)
	{
		logFN('Creating table ' + key);

		db.run(value, function(err)
		{
			callback(err);
		});

	}, function done(err) {
		cb(err);
	});

};
