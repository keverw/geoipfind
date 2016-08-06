module.exports = function(db, logFN, cb)
{
    var async = require('async');

    var cmds = {};
    
    //meta_table
    cmds.table_meta = 'CREATE TABLE `meta` (`id` TEXT, `val` TEXT, PRIMARY KEY(id));';

    //table_asn
    cmds.table_asn = 'CREATE TABLE `asn` (`start` BLOB, `end` BLOB, `version` INTEGER, `as_num` TEXT, `name` TEXT, PRIMARY KEY(version,start,end));';

    //geo_blocks_table
    cmds.table_geo_blocks = 'CREATE TABLE `geo_blocks` (`start` BLOB, `end` BLOB, `version` INTEGER, `geoname_id` INTEGER, `registered_country_geoname_id` INTEGER, `represented_country_geoname_id` INTEGER, `is_anonymous_proxy` INTEGER, `is_satellite_provider` INTEGER, `postal_code` TEXT, `latitude` NUMERIC, `longitude` NUMERIC, `accuracy_radius` INTEGER,\ PRIMARY KEY(version,start,end));';

    //geo_names
    cmds.table_geo_names = 'CREATE TABLE `geo_names` (`geoname_id` INTEGER, `type` INTEGER, `geo_lookup` TEXT, `continent_code` TEXT, `country_iso_code` TEXT, `subdivision_1_iso_code` TEXT, `subdivision_2_iso_code` TEXT, `metro_code` TEXT, `time_zone` TEXT, PRIMARY KEY(geoname_id));';
    cmds.geoname_geo_lookup = 'CREATE INDEX geoname_geo_lookup ON geo_names (geo_lookup);';

    //lang_table
    cmds.table_lang = 'CREATE TABLE `lang` (`field` TEXT, `code` TEXT, `lookup_code` TEXT, `de` TEXT, `en` TEXT, `es` TEXT, `fr` INTEGER, `ja` INTEGER, `pt-BR` INTEGER, `ru` INTEGER, `zh-CN` INTEGER, PRIMARY KEY(field,code,lookup_code));';
    cmds.lang_lookup_code = 'CREATE INDEX lang_lookup_code ON lang (lookup_code);';

    async.eachOfSeries(cmds, function(value, key, callback)
    {
        var keySplit = key.split('_');

        var type = keySplit.shift();
        var name = keySplit.join('_');

        ////////////////////////////////////////////////
        if (type == 'table')
        {
            logFN('Creating table ' + name);
        }
        else
        {
            logFN('Creating index ' + name);
        }

        db.run(value, function(err)
        {
            callback(err);
        });

    }, function done(err) {
        cb(err);
    });

};
