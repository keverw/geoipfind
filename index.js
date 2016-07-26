(function ()
{
	var inet_pton = require('./lib/inet_pton.js');

	function buildDatabase(databaseLocation, options, cb, logCB)
	{
		var path = require('path'),
			fs = require('fs'),
			mkdirp = require('mkdirp'),
			progress = require('progrescii'),
			wget = require('wget-improved'),
			filesize = require('file-size'),
			humanizeDuration = require('humanize-duration'),
			del = require('delete'),
			zip = require('cross-zip'),
			countLinesInFile = require('count-lines-in-file'),
			LineByLineReader = require('line-by-line'),
			ip = require('ip');

		var sqlite3 = require('sqlite3').verbose();
		//var sqlite3 = require('sqlite3');

		options = options || {};
		options.verbose = (options.verbose === undefined) ? true : false;

		function log(text)
		{
			var ts = '[' + new Date().toISOString() + '] ';

			if (options.verbose)
			{
				console.log(ts + text);
			}

			if (typeof logCB === 'function')
			{
				logCB(ts + text);
			}

		}

		function cbOnly(text)
		{
			var ts = '[' + new Date().toISOString() + '] ';

			if (typeof logCB === 'function')
			{
				logCB(ts + text);
			}

		}

		function done(err)
		{
			console.log(err);
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
				if (err)
				{
					done(err);
				}
				else
				{
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
									if (err)
									{
										done(err);
									}
									else
									{
										step2();
									}

								});

							}
							else
							{
								done(err);
							}
						}
						else
						{
							done(new Error('data.db exists already. If you wish to build it, delete it first'));
						}

					});

				}

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
						done(err);
					}
				}
				else
				{
					var cTime = new Date().getTime();

					var fileAge = cTime - stats.mtime.getTime();
					var oneHour = 60 * 60 * 1000;
					var eightHours = oneHour*12;

					if (fileAge > eightHours)
					{
						log(filename + ' older than 8 hours, redownloading');

						del([path], function(err) {
							if (err)
							{
								done(err);
							}
							else
							{
								step2(filename + '-download');
							}

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

			download.on('error', function(err)
			{
				del.sync([path]);
				done(err);
			});

			download.on('start', function(fileSize)
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

			download.on('end', function(output)
			{
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
					cbOnly('Downloaded ' + precent + '%');
				}

				if (downloadPBar)
				{
					downloadPBar.set(precent);
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
							if (err)
							{
								cb(err);
							}
							else
							{
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

							}

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
						if (err)
						{
							done(err);
						}
						else
						{
							step2('GeoIPASNum2v6.zip-check');
						}

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
						if (err)
						{
							done(err);
						}
						else
						{
							step2('GeoLite2-City-CSV.zip-check');
						}

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
						if (err)
						{
							done(err);
						}
						else
						{
							//load path as its one level deeper based on date
							fs.readdir(zip_file_output, function(err, files)
							{
								if (err)
								{
									done(err);
								}
								else
								{

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

								}

							});

						}

					});

				}

			}
			else
			{
				log('Step 2 - Downloads');
				step2('GeoIPASNum2.zip-check');
			}

		}

		function readCSV(file, errCB, lineCB, endCB, countCB)
		{
			var processdLines = 0;

			countLinesInFile(file, function(err, num)
			{
				if (err)
				{
					errCB(err);
				}
				else
				{
					countCB(num);

					var lbl = new LineByLineReader(file);

					lbl.on('error', function(err)
					{
						errCB(err);
					});

					lbl.on('line', function(line)
					{
						processdLines++;
						lineCB(lbl, processdLines, line.split(','));
					});

					lbl.on('end', function()
					{
						endCB();
					});

				}

			});

		}

		var db = null;

		var filesTotal = 12;
		var filesProcessed = 0;

		function step3(substep)
		{
			if (['GeoIPASNum2.csv'].indexOf(substep) > -1)
			{
				log('Imported files ' + filesProcessed + '/' + filesTotal);
			}

			if (substep == 'GeoIPASNum2.csv')
			{
				// log('Importing GeoIPASNum2.csv');
				//
				// db.run("BEGIN TRANSACTION", function(err)
				// {
				// 	if (err)
				// 	{
				// 		done(err);
				// 	}
				// 	else
				// 	{
				// 		var GeoIPASNum2_csv = path.join(unzippedFolders, 'ASN-v4', 'GeoIPASNum2.csv');
				//
				// 		//todo: progress bar?
				//
				// 		var csvFile = path.join(unzippedFolders, 'ASN-v4', 'GeoIPASNum2.csv');
				// 		var hadErr = false;
				//
				// 		readCSV(
				// 			csvFile,
				// 			function err(err)
				// 			{
				// 				console.log(err);
				// 			},
				// 			function line(handler, lineNum, data)
				// 			{
				// 				if (!hadErr)
				// 				{
				// 					var startIP = ip.fromLong(data[0]);
				// 					var endIP = ip.fromLong(data[1]);
				// 					var AS_Str = data[2].slice(1, -1).split(' ');
				//
				// 					var AS_Num = AS_Str.shift();
				// 					var ISPName = AS_Str.join(' ');
				//
				// 					db.run("INSERT INTO asn VALUES (?)", [  ], function(err)
				// 					{
				// 						if (err)
				// 						{
				// 							hadErr = true;
				// 							handler.close();
				// 							done(err);
				// 						}
				//
				// 					});
				//
				// 					console.log(lineNum, startIP, endIP, AS_Num, ISPName);
				// 				}
				// 			},
				// 			function end()
				// 			{
				// 				if (!hadErr)
				// 				{
				// 					console.log('end');
				// 				}
				//
				// 			},
				// 			function count(num)
				// 			{
				// 				console.log(num);
				// 			}
				// 		);
				//
				// 	}
				//
				// });

			}
			else
			{

				if (!db)
				{
					log('Creating database and tables');
					db = new sqlite3.Database(dbFile);

					

					//Create tables
					db.run('CREATE TABLE `asn` (\
						`start`	BLOB,\
						`end`	BLOB,\
						`version`	INTEGER,\
						`as_num`	TEXT,\
						`name`	TEXT,\
						PRIMARY KEY(start,end)\
					);', function(err)
					{
						if (err)
						{
							done(err)
						}
						else
						{
							db.run('CREATE TABLE `geo_blocks` (\
								`start`	BLOB,\
								`end`	BLOB,\
								`version`	INTEGER,\
								`geoname_id`	INTEGER,\
								`registered_country_geoname_id`	INTEGER,\
								`represented_country_geoname_id`	INTEGER,\
								`is_anonymous_proxy`	INTEGER,\
								`is_satellite_provider`	INTEGER,\
								`postal_code`	TEXT,\
								`latitude`	NUMERIC,\
								`longitude`	NUMERIC,\
								`accuracy_radius`	INTEGER,\
								PRIMARY KEY(start,end)\
							);', function(err)
							{
								if (err)
								{
									done(err);
								}
								else
								{

									db.run('CREATE TABLE `geo_names` (\
										`geoname_id`	INTEGER,\
										`locale_code`	TEXT,\
										`continent_code`	TEXT,\
										`country_iso_code`	TEXT,\
										`subdivision_1_iso_code`	TEXT,\
										`subdivision_2_iso_code`	TEXT,\
										`metro_code`	TEXT,\
										`time_zone`	TEXT,\
										PRIMARY KEY(geoname_id)\
									);', function(err)
									{
										if (err)
										{
											done(err);
										}
										else
										{

											db.run('CREATE TABLE `lang` (\
												`field`	TEXT,\
												`code`	TEXT,\
												`de`	TEXT,\
												`en`	TEXT,\
												`es`	TEXT,\
												`fr`	INTEGER,\
												`ja`	INTEGER,\
												`pt-BR`	INTEGER,\
												`ru`	INTEGER,\
												`zh-CN`	INTEGER,\
												PRIMARY KEY(field,code)\
											);', function(err)
											{
												if (err)
												{
													done(err);
												}
												else
												{
													step3('GeoIPASNum2.csv');
												}

											});

										}

									});

								}

							});

						}

					});

				}

			}

			// console.log(GeoLite2Path); //path to current month in the folder caluated

		// 	var csvFile = path.join(unzippedFolders, 'ASN-v4', 'GeoIPASNum2.csv');
		//
		// 	readCSV(
		// 		csvFile,
		// 		function err(err)
		// 		{
		// 			console.log(err);
		// 		},
		// 		function line(lineNum, data)
		// 		{
		// 			console.log(lineNum, data);
		// 		},
		// 		function end()
		// 		{
		// 			console.log('end');
		// 		},
		// 		function count(num)
		// 		{
		// 			console.log(num);
		// 		}
		// );
		//
		//
		// 	console.log(substep);

//			console.log('step 3 later');

		}

		//Call Step 1
		step1();




		//todo: this would go ahead and download the data and build the database
	}

	function geoIP(databaseLocation)
	{
		//todo: this would return a object with .close(to close the database) and .find
	}

	// Export public API
	var geoipfind = {};

	geoipfind.buildDatabase = buildDatabase;
	geoipfind.geoIP = geoIP;

	module.exports = geoipfind;
}());
