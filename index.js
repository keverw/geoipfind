(function ()
{
    //Continent Code to geonameId map - missing data as only Asia, Europe are imported as Continent data in geo_names table
    //Found on: http://download.geonames.org/export/dump/
    var continentCodeMap = {
        AF: 6255146,
        AS: 6255147,
        EU: 6255148,
        NA: 6255149,
        OC: 6255151,
        SA: 6255150,
        AN: 6255152
    };

    ////////////////////////////////////////////////////////////
    var path = require('path'),
        async = require('async'),
        ip = require('ip'),
        inet_pton = require('./lib/inet_pton.js');

    //var sqlite3 = require('sqlite3').verbose();
    var sqlite3 = require('sqlite3');

    function inParam(sql, arr) //thanks https://github.com/mapbox/node-sqlite3/issues/527
    {
      return sql.replace('?#', arr.map(()=> '?').join(','));
    }

    function buildDatabase(databaseLocation, options, buildDone, logCB)
    {
        process.setMaxListeners(0);

        var fs = require('fs'),
            mkdirp = require('mkdirp'),
            progress = require('progrescii'),
            wget = require('wget-improved'),
            filesize = require('file-size'),
            humanizeDuration = require('humanize-duration'),
            del = require('delete'),
            zip = require('cross-zip');

        var createSchema = require('./lib/createSchema.js'),
            importASN = require('./lib/importASN.js'),
            importBlocks = require('./lib/importBlocks.js'),
            geoNames = require('./lib/geoNames.js');

        options = options || {};
        options.verbose = (options.verbose === undefined) ? true : options.verbose;
        options.memory = (options.memory === undefined) ? true : options.memory;

        function log(text, cbOnly)
        {
            var ts = '[' + new Date().toISOString() + '] ';

            if (cbOnly && typeof logCB === 'function') //log to logCB only
            {
                logCB(ts + text);
            }
            else //log anthing
            {
                if (options.verbose)
                {
                    console.log(ts + text);
                }

                if (typeof logCB === 'function')
                {
                    logCB(ts + text);
                }

            }

        }

        //Steps to build the database
        var startTime = new Date();
        log('Starting Database Build');

        databaseLocation = path.resolve(databaseLocation);
        var tmpLoc = path.join(databaseLocation, 'tmp');
        var dbFile = path.join(databaseLocation, 'data.db');
        var unzippedFolders = path.join(tmpLoc, 'unzipped');
        var GeoLite2Path = '';

        //Step 1 - Check if folders exists
        function step1()
        {
            log('Step 1 - Checking if folders exists and creating them if needed');
            log('mkdirp on ' + databaseLocation);

            mkdirp(databaseLocation, function (err)
            {
                if (err) return buildDone(err);

                //check for database
                log('Checking for ' + dbFile);
                fs.stat(dbFile, function(err, stats)
                {
                    if (err)
                    {
                        if (err.code == 'ENOENT') //download
                        {
                            log('mkdirp on ' + tmpLoc);
                            mkdirp(tmpLoc, function (err)
                            {
                                if (err) return buildDone(err);
                                step2();
                            });

                        }
                        else
                        {
                            buildDone(err);
                        }
                    }
                    else
                    {
                        buildDone(new Error('data.db exists already. If you wish to build it, delete it first'));
                    }

                });

            });

        }

        //Step 2 - Downloads
        function checkFile(filename, path)
        {
            log('Checking for ' + filename);

            fs.stat(path, function(err, stats)
            {
                if (err)
                {
                    if (err.code == 'ENOENT') //download
                    {
                        step2(filename + '-download');
                    }
                    else
                    {
                        buildDone(err);
                    }
                }
                else
                {
                    var cTime = new Date().getTime();

                    var fileAge = cTime - stats.mtime.getTime();
                    var oneHour = 60 * 60 * 1000;

                    if (fileAge > oneHour*12)
                    {
                        log(filename + ' older than 12 hours, redownloading');

                        del([path], function(err)
                        {
                            if (err) return buildDone(err);
                            step2(filename + '-download');
                        });

                    }
                    else
                    {
                        step2(filename + '-unzip');
                    }

                }

            });


        }

        function downloadFile(filename, path, downloadURL)
        {
            log('Downloading for ' + filename);

            var downloadStartTime = 0;
            var downloadFileSize = 0;
            var downloadPBar = null;

            var download = wget.download(downloadURL, path, {gunzip: true});

            download.once('error', function(err)
            {
                download.removeAllListeners();
                del.sync([path]);
                buildDone(err);
            });

            download.once('start', function(fileSize)
            {
                downloadStartTime = new Date();
                fileSize = parseInt(fileSize);
                downloadFileSize = fileSize;

                log('Downloading ' + downloadURL + ' - Total Size: ' + filesize(fileSize).human('si'));

                if (options.verbose)
                {
                    downloadPBar = progress.create({
                        size: 20,
                        total: 100,
                        pending: '░',
                        complete: '█',
                        template: 'Downloading :b :p% in :ts'
                        // Template Text tokens:
                        //:b progress bar text
                        //:p percentage Number
                        //:t execution time
                    });

                }

            });

            download.once('end', function(output)
            {
                download.removeAllListeners();
                var totalMS = processLastTime.getTime() - downloadStartTime.getTime();
                log(output + ', Took ' + humanizeDuration(totalMS));
                step2(filename + '-unzip');
            });

            var progressBarLast = 0;
            var processLastTime = new Date();
            download.on('progress', function(progress)
            {
                processLastTime = new Date();
                var precent = parseInt(progress*100);

                if (progressBarLast != precent)
                {
                    progressBarLast = precent;
                    log('Downloaded ' + precent + '%', true);

                    if (downloadPBar)
                    {
                        downloadPBar.set(precent);
                    }

                }

            });

        }

        function unzipFile(filename, path, outputPath, cb)
        {
            fs.stat(outputPath, function(err, stats)
            {
                if (err)
                {
                    if (err.code == 'ENOENT') //go on
                    {
                        mkdirp(outputPath, function (err)
                        {
                            if (err) return cb(err);

                            log('Unzipping ' + filename);

                            var start = new Date();

                            zip.unzip(path, outputPath, function(err)
                            {
                                if (err)
                                {
                                    del.sync([outputPath]);
                                    cb(err);
                                }
                                else
                                {
                                    var totalMS = new Date().getTime() - start;
                                    log('Done unzipping ' + filename + ', Took ' + humanizeDuration(totalMS));
                                    cb();
                                }

                            });

                        });

                    }
                    else
                    {
                        cb(err);
                    }

                }
                else //already unzipped
                {
                    log(filename + ' already unzipped');
                    cb(null);
                }

            });

        }

        function step2(substep)
        {
            //GeoLite ASN and GeoLite ASN IPv6 from http://dev.maxmind.com/geoip/legacy/geolite/
            //Download http://download.maxmind.com/download/geoip/database/asnum/GeoIPASNum2.zip for ISP V4
            //Download http://download.maxmind.com/download/geoip/database/asnum/GeoIPASNum2v6.zip for ISP V6

            //Get GeoLite2 City from http://dev.maxmind.com/geoip/geoip2/geolite2/
            //Download http://geolite.maxmind.com/download/geoip/database/GeoLite2-City-CSV.zip for the rest of the data we need

            if (substep == 'GeoIPASNum2.zip-check' || substep == 'GeoIPASNum2.zip-download' || substep == 'GeoIPASNum2.zip-unzip')
            {
                var filename = 'GeoIPASNum2.zip';
                var zip_file = path.join(tmpLoc, 'GeoIPASNum2.zip');
                var zip_file_output = path.join(unzippedFolders, 'ASN-v4');

                if (substep == 'GeoIPASNum2.zip-check')
                {
                    checkFile(filename, zip_file);
                }
                else if (substep == 'GeoIPASNum2.zip-download')
                {
                    downloadFile(filename, zip_file, 'http://download.maxmind.com/download/geoip/database/asnum/GeoIPASNum2.zip');
                }
                else if (substep == 'GeoIPASNum2.zip-unzip')
                {
                    unzipFile(filename, zip_file, zip_file_output, function(err)
                    {
                        if (err) return buildDone(err);
                        step2('GeoIPASNum2v6.zip-check');
                    });

                }

            }
            else if (substep == 'GeoIPASNum2v6.zip-check' || substep == 'GeoIPASNum2v6.zip-download' || substep == 'GeoIPASNum2v6.zip-unzip')
            {
                var filename = 'GeoIPASNum2v6.zip';
                var zip_file = path.join(tmpLoc, 'GeoIPASNum2v6.zip');
                var zip_file_output = path.join(unzippedFolders, 'ASN-v6');

                if (substep == 'GeoIPASNum2v6.zip-check')
                {
                    checkFile(filename, zip_file);
                }
                else if (substep == 'GeoIPASNum2v6.zip-download')
                {
                    downloadFile(filename, zip_file, 'http://download.maxmind.com/download/geoip/database/asnum/GeoIPASNum2v6.zip');
                }
                else if (substep == 'GeoIPASNum2v6.zip-unzip')
                {
                    unzipFile(filename, zip_file, zip_file_output, function(err)
                    {
                        if (err) return buildDone(err);
                        step2('GeoLite2-City-CSV.zip-check');
                    });

                }

            }
            else if (substep == 'GeoLite2-City-CSV.zip-check' || substep == 'GeoLite2-City-CSV.zip-download' || substep == 'GeoLite2-City-CSV.zip-unzip')
            {
                var filename = 'GeoLite2-City-CSV.zip';
                var zip_file = path.join(tmpLoc, 'GeoLite2-City-CSV.zip');
                var zip_file_output = path.join(unzippedFolders, 'GeoLite2-City');

                if (substep == 'GeoLite2-City-CSV.zip-check')
                {
                    checkFile(filename, zip_file);
                }
                else if (substep == 'GeoLite2-City-CSV.zip-download')
                {
                    downloadFile(filename, zip_file, 'http://geolite.maxmind.com/download/geoip/database/GeoLite2-City-CSV.zip');
                }
                else if (substep == 'GeoLite2-City-CSV.zip-unzip')
                {
                    unzipFile(filename, zip_file, zip_file_output, function(err)
                    {
                        if (err) return buildDone(err);

                        //load path as its one level deeper based on date
                        fs.readdir(zip_file_output, function(err, files)
                        {
                            if (err) return buildDone(err);

                            for (var i in files)
                            {
                                var file = files[i];

                                if (files[i].charAt(0) != '.')
                                {
                                    GeoLite2Path = path.join(zip_file_output, file);
                                    break;
                                }

                            }

                            step3();

                        });

                    });

                }

            }
            else
            {
                log('Step 2 - Downloads');
                step2('GeoIPASNum2.zip-check');
            }

        }

        var db = null;

        var filesTotal = 12;
        var filesProcessed = 0;

        function step3(substep)
        {
            if (['GeoIPASNum2.csv', 'GeoIPASNum2v6.csv', 'GeoLite2-City-Blocks-IPv4.csv', 'GeoLite2-City-Blocks-IPv6.csv', 'geo_names'].indexOf(substep) > -1)
            {
                log('Imported files ' + filesProcessed + '/' + filesTotal);
            }

            if (substep == 'GeoIPASNum2.csv')
            {
                var GeoIPASNum2_csv = path.join(unzippedFolders, 'ASN-v4', 'GeoIPASNum2.csv');

                log('Importing GeoIPASNum2.csv');

                importASN(db, log, options.verbose, GeoIPASNum2_csv, 4, function(err)
                {
                    if (err)
                    {
                        db.close(function(err2)
                        {
                            buildDone(err);
                        });

                    }
                    else
                    {
                        filesProcessed++;
                        step3('GeoIPASNum2v6.csv');
                    }

                });

            }
            else if (substep == 'GeoIPASNum2v6.csv')
            {
                var GeoIPASNum2v6_csv = path.join(unzippedFolders, 'ASN-v6', 'GeoIPASNum2v6.csv');

                log('Importing GeoIPASNum2v6.csv');

                importASN(db, log, options.verbose, GeoIPASNum2v6_csv, 6, function(err)
                {
                    if (err)
                    {
                        db.close(function(err2)
                        {
                            buildDone(err);
                        });

                    }
                    else
                    {
                        filesProcessed++;
                        step3('GeoLite2-City-Blocks-IPv4.csv');
                    }

                });

            }
            else if (substep == 'GeoLite2-City-Blocks-IPv4.csv')
            {
                var v4_blocks_csv = path.join(GeoLite2Path, 'GeoLite2-City-Blocks-IPv4.csv');

                log('Importing GeoLite2-City-Blocks-IPv4.csv');

                importBlocks(db, log, options.verbose, v4_blocks_csv, 4, function(err)
                {
                    if (err)
                    {
                        db.close(function(err2)
                        {
                            buildDone(err);
                        });

                    }
                    else
                    {
                        filesProcessed++;
                        step3('GeoLite2-City-Blocks-IPv6.csv');
                    }

                });

            }
            else if (substep == 'GeoLite2-City-Blocks-IPv6.csv')
            {
                var v6_blocks_csv = path.join(GeoLite2Path, 'GeoLite2-City-Blocks-IPv6.csv');

                log('Importing GeoLite2-City-Blocks-IPv6.csv');

                importBlocks(db, log, options.verbose, v6_blocks_csv, 6, function(err)
                {

                    if (err)
                    {
                        db.close(function(err2)
                        {
                            buildDone(err);
                        });

                    }
                    else
                    {
                        filesProcessed++;
                        step3('geo_names');
                    }

                });

            }
            else if (substep == 'geo_names')
            {
                log('Importing GEO Names database');

                //English always has to be imported first.
                //If Dutch, etc is imported first, 3345438 is classified as geo_type 3 because the city name is missing.
                //If English is imported first, 3345438 is classified as geo_type 5 because the city name isn't missing.

                var langs = ['en', 'de', 'es', 'fr', 'ja', 'pt-BR', 'ru', 'zh-CN'];

                async.eachOfSeries(langs, function(value, key, callback)
                {
                    var fileLoc = path.join(GeoLite2Path, 'GeoLite2-City-Locations-' + value + '.csv');

                    geoNames(db, log, options.verbose, fileLoc, value, function(err)
                    {
                        if (!err)
                        {
                            filesProcessed++;
                            log('Imported files ' + filesProcessed + '/' + filesTotal);
                        }

                        callback(err)
                    });

                }, function done(err)
                {
                    if (err)
                    {
                        db.close(function(err2)
                        {
                            buildDone(err);
                        });

                    }
                    else
                    {
                        step3('reload');
                    }

                });

            }
            else if (substep == 'reload')
            {
                log('Reloading database...');

                db.close(function(err)
                {
                    if (err) return buildDone(err);

                    db = new sqlite3.Database(dbFile);
                    step3('vacuum');
                });

            }
            else if (substep == 'vacuum')
            {
                var vStart = new Date();
                log('Vacuuming Database..');

                db.run('VACUUM', function(err)
                {
                    if (err) return buildDone(err);

                    var totalMS = new Date().getTime() - vStart.getTime();
                    log('Vacuuming Took ' + humanizeDuration(totalMS));
                    log('Closing database...');

                    db.close(function(err)
                    {
                        if (err) return buildDone(err);
                        step3('cleanup');
                    });

                });

            }
            else if (substep == 'cleanup')
            {
                log('Cleaning up tmp files...');

                del([tmpLoc], function(err)
                {
                    if (err) return buildDone(err);

                    var totalMS = new Date().getTime() - startTime.getTime();
                    log('Done Building Database - Took ' + humanizeDuration(totalMS));
                    buildDone(null);
                });

            }
            else
            {

                if (!db)
                {
                    log('Creating database and tables');
                    db = new sqlite3.Database(dbFile);

                    //PRAGMA synchronous = OFF and PRAGMA journal_mode = MEMORY in attempts to speed up large import
                    //As long as no crashes or powerloss, the database will be fine. Would never do this in production, but it's a read only database and data is a from a repeatable source
                    var dbSettings = ['PRAGMA synchronous=OFF'];

                    if (options.memory)
                    {
                        dbSettings.push('PRAGMA journal_mode=MEMORY', 'pragma temp_store=memory');
                    }

                    async.eachOfSeries(dbSettings, function(value, key, callback)
                    {
                        db.run(value, function(err)
                        {
                            callback(err);
                        });

                    }, function done(err)
                    {
                        createSchema(db, log, function(err)
                        {
                            if (err) return buildDone(err);

                            db.run('INSERT INTO meta (id, val) VALUES (?, ?)', ['buildDate', startTime.toISOString()], function(err)
                            {
                                if (err) return buildDone(err);
                                step3('GeoIPASNum2.csv');
                            });

                        });

                    });

                }

            }

        }

        //Call Step 1
        step1();
    }

    function geoIP(databaseLocation, openCB)
    {
        databaseLocation = path.resolve(databaseLocation);

        var dbFile = path.join(databaseLocation, 'data.db');

        function geoIPClass(db)
        {
            this.db = db;
        }

        geoIPClass.prototype._ipVer = function(ipAddr)
        {
            if (ip.isV4Format(ipAddr)) {
                return 4;
            } else if (ip.isV6Format(ipAddr)) {
                return 6;
            } else {
                return null;
            }

        }

        geoIPClass.prototype._findGeonames = function(ids, cb)
        {
            var geonameData = {};

            this.db.all(inParam('SELECT * from geo_names WHERE geoname_id in (?#)', ids), ids, function(err, geoname_rows)
            {
                if (err) return cb(err);

                if (geoname_rows.length > 0)
                {
                    for (key in geoname_rows)
                    {
                        geonameData[geoname_rows[key].geoname_id] = geoname_rows[key];
                    }

                    cb(null, geonameData)
                }
                else
                {
                    cb(err, geonameData);
                }

            });

        }

        geoIPClass.prototype._findByGeoLookupCode = function(ids, cb)
        {
            geo_lookupData = {};

            if (ids.length > 0)
            {
                this.db.all(inParam('SELECT * from geo_names WHERE geo_lookup in (?#)', ids), ids, function(err, geo_lookup_rows)
                {
                    if (err) return cb(err);

                    if (geo_lookup_rows.length > 0)
                    {

                        for (key in geo_lookup_rows)
                        {
                            geo_lookupData[geo_lookup_rows[key].geo_lookup] = geo_lookup_rows[key];
                        }

                        cb(null, geo_lookupData);
                    }
                    else
                    {
                        cb(null, geo_lookupData);
                    }

                });

            }
            else
            {
                cb(null, geo_lookupData);
            }

        }

        geoIPClass.prototype._setLangCode = function(obj, field, code)
        {
            var langLookupIndent = field + '.' + code;
            obj[langLookupIndent] = [field, code];
            return langLookupIndent;
        }

        geoIPClass.prototype._findLoc = function(ipAddr, version, pton, cb)
        {
            var self = this;

            var resultOutput = {ver: version};
            var langLookups = {};

            self.db.get("SELECT * FROM geo_blocks WHERE version = ? AND (? BETWEEN start AND end) ORDER BY start DESC, end ASC LIMIT 1", [version, pton], function(err, row)
            {
                if (err) return cb(err);

                if (row)
                {
                    resultOutput.is_anonymous_proxy = row.is_anonymous_proxy;
                    resultOutput.is_satellite_provider = row.is_satellite_provider;

                    //grab geoname data
                    var geonames = [];

                    if (row.geoname_id) {
                        geonames.push(row.geoname_id);
                    }

                    if (row.registered_country_geoname_id) {
                        geonames.push(row.registered_country_geoname_id);
                    }

                    if (row.represented_country_geoname_id) {
                        geonames.push(row.represented_country_geoname_id);
                    }

                    self._findGeonames(geonames, function(err, geonamesResult)
                    {
                        if (err) return cb(err);

                        var geoname_idResult = geonamesResult[row.geoname_id];

                        if (geoname_idResult)
                        {
                            //continent
                            resultOutput.continent = {
                                geoname_id: continentCodeMap[geoname_idResult.continent_code],
                                code: geoname_idResult.continent_code,
                                _langLookup: self._setLangCode(langLookups, 'continent_name', geoname_idResult.continent_code)
                            };

                            //geo_lookup codes to lookup - country and subdivision_1_iso_code and subdivision_2_iso_code
                            var geo_lookup = [];

                            //country
                            var countryLookupCode = '';
                            if (geoname_idResult.country_iso_code && geoname_idResult.country_iso_code.length > 0) {
                                countryLookupCode = [2, geoname_idResult.continent_code, geoname_idResult.country_iso_code].join('.');
                                geo_lookup.push(countryLookupCode);
                            }

                            //subdivision_1_iso_code
                            var subdivision1LookupCode = '';
                            if (geoname_idResult.subdivision_1_iso_code && geoname_idResult.subdivision_1_iso_code.length > 0) {
                                subdivision1LookupCode = [3, geoname_idResult.continent_code, geoname_idResult.country_iso_code, geoname_idResult.subdivision_1_iso_code].join('.');
                                geo_lookup.push(subdivision1LookupCode);
                            }

                            //subdivision_2_iso_code
                            var subdivision2LookupCode = '';
                            if (geoname_idResult.subdivision_2_iso_code && geoname_idResult.subdivision_2_iso_code.length > 0) {
                                subdivision2LookupCode = [4, geoname_idResult.continent_code, geoname_idResult.country_iso_code, geoname_idResult.subdivision_1_iso_code, geoname_idResult.subdivision_2_iso_code].join('.');
                                geo_lookup.push(subdivision2LookupCode);
                            }

                            //Do database query
                            self._findByGeoLookupCode(geo_lookup, function(err, geo_lookupResults)
                            {
                                if (err) return cb(err);

                                //country data
                                var countryMeta = geo_lookupResults[countryLookupCode];

                                if (countryMeta)
                                {
                                    resultOutput.country = {
                                        geoname_id: countryMeta.geoname_id,
                                        iso_code: countryMeta.country_iso_code,
                                        _langLookup: self._setLangCode(langLookups, 'country_name', [countryMeta.continent_code, countryMeta.country_iso_code].join('.'))
                                    };

                                }

                                //city data
                                if (geoname_idResult.type == 5)
                                {
                                    resultOutput.city = {
                                        geoname_id: geoname_idResult.geoname_id,
                                        _langLookup: self._setLangCode(langLookups, 'city_name', geoname_idResult.geoname_id)
                                    };

                                }

                                //location data
                                resultOutput.location = {
                                    latitude: row.latitude,
                                    longitude: row.latitude,
                                    metro_code: geoname_idResult.metro_code,
                                    time_zone: geoname_idResult.time_zone
                                };

                                //postal code
                                resultOutput.postal = {
                                    code: row.postal_code
                                };

                                //registered_country_geoname_id
                                if (row.registered_country_geoname_id)
                                {
                                    var countryData = geonamesResult[row.registered_country_geoname_id];

                                    if (countryData)
                                    {
                                        resultOutput.registered_country = {
                                            geoname_id: countryData.geoname_id,
                                            iso_code: countryData.country_iso_code,
                                            _langLookup: self._setLangCode(langLookups, 'country_name', [countryData.continent_code, countryData.country_iso_code].join('.'))
                                        };

                                    }

                                }

                                //represented_country_geoname_id
                                if (row.represented_country_geoname_id)
                                {
                                    var countryData = geonamesResult[row.represented_country_geoname_id];

                                    if (countryData)
                                    {
                                        resultOutput.represented_country = {
                                            geoname_id: countryData.geoname_id,
                                            iso_code: countryData.country_iso_code,
                                            _langLookup: self._setLangCode(langLookups, 'country_name', [countryData.continent_code, countryData.country_iso_code].join('.'))
                                        };
                                    }

                                }

                                //subdivisions
                                //subdivision - 1
                                if (subdivision1LookupCode.length > 0)
                                {
                                    var subdivisionData = geo_lookupResults[subdivision1LookupCode];

                                    //process if a non null result
                                    if (subdivisionData)
                                    {
                                        if (resultOutput.subdivisions === undefined) {resultOutput.subdivisions = [];}

                                        ////push onto subdivisions
                                        resultOutput.subdivisions.push({
                                            geoname_id: subdivisionData.geoname_id,
                                            iso_code: subdivisionData.subdivision_1_iso_code,
                                            _langLookup: self._setLangCode(langLookups, 'subdivision_1_name', [subdivisionData.continent_code, subdivisionData.country_iso_code, subdivisionData.subdivision_1_iso_code].join('.'))
                                        });

                                    }

                                }

                                //subdivision - 2
                                if (subdivision2LookupCode.length > 0)
                                {
                                    var subdivisionData = geo_lookupResults[subdivision2LookupCode];

                                    //process if a non null result
                                    if (subdivisionData)
                                    {
                                        if (resultOutput.subdivisions === undefined) {resultOutput.subdivisions = [];}

                                        ////push onto subdivisions
                                        resultOutput.subdivisions.push({
                                            geoname_id: subdivisionData.geoname_id,
                                            iso_code: subdivisionData.subdivision_2_iso_code,
                                            _langLookup: self._setLangCode(langLookups, 'subdivision_2_name', [subdivisionData.continent_code, subdivisionData.country_iso_code, subdivisionData.subdivision_1_iso_code, subdivisionData.subdivision_2_iso_code].join('.'))
                                        });

                                    }

                                }

                                //Resolve Langauge Strings
                                console.log(resultOutput);
                                console.log(langLookups);


                            });

                        }
                        else
                        {
                            cb(new Error('Geonames Not Found'));
                        }

                    });

                }
                else
                {
                    cb(err, false, resultOutput);
                }

            });

        }

        geoIPClass.prototype._findISP = function(ipAddr, version, pton, cb)
        {

            this.db.get("SELECT * FROM asn WHERE version = ? AND (? BETWEEN start AND end) ORDER BY start DESC, end ASC LIMIT 1", [version, pton], function(err, row)
            {
                var result = {ver: version};

                if (err) return cb(err);

                if (row)
                {
                    result.asn = row.as_num;
                    result.name = row.name;
                    cb(err, true, result);
                }
                else
                {
                    cb(err, false, result);
                }

            });

        }

        /////////////////////////////////////////////////////////////////
        geoIPClass.prototype.findGeoname = function(id, cb)
        {
            //todo: probably support list too.
            //todo ...
        }

        geoIPClass.prototype.findLoc = function(ipAddr, cb)
        {
            if (typeof ipAddr == 'string' && ipAddr.length > 0)
            {
                var ver = this._ipVer(ipAddr);

                if (ver > 0)
                {
                    this._findLoc(ipAddr, ver, inet_pton(ipAddr), cb);
                }
                else //Bad IP format
                {
                    cb(new Error('Bad IP format'));
                }

            }
            else
            {
                cb(new Error('Non string IP Address or Empty'));
            }

        }

        geoIPClass.prototype.findISP = function(ipAddr, cb)
        {
            if (typeof ipAddr == 'string' && ipAddr.length > 0)
            {
                var ver = this._ipVer(ipAddr);

                if (ver > 0)
                {
                    this._findISP(ipAddr, ver, inet_pton(ipAddr), cb);
                }
                else //Bad IP format
                {
                    cb(new Error('Bad IP format'));
                }

            }
            else
            {
                cb(new Error('Non string IP Address or Empty'));
            }

        }

        geoIPClass.prototype.find = function(ipAddr, cb) //find both
        {
            //todo ...
        }

        geoIPClass.prototype.close = function(cb)
        {
            (typeof cb == 'function') ? this.db.close(cb) : this.db.close();
        }

        return new geoIPClass((typeof openCB == 'function') ? new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY, openCB) : new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY));
    }

    // Export public API
    var geoipfind = {};

    geoipfind.buildDatabase = buildDatabase;
    geoipfind.geoIP = geoIP;

    module.exports = geoipfind;
}());
