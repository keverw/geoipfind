(function ()
{
	var inet_pton = require('./lib/inet_pton.js');
	var createSchema = require('./lib/createSchema.js');
	var importASN = require('./lib/importASN.js');

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

		var db = null;

		var filesTotal = 12;
		var filesProcessed = 0;

		function step3(substep)
		{
			if (['GeoIPASNum2.csv', 'GeoIPASNum2v6.csv', 'GeoLite2-City-Blocks-IPv4.csv'].indexOf(substep) > -1)
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
							done(err);
						});

					}
					else
					{
						filesProcessed++;
						step3('GeoIPASNum2v6.csv');
					}

				});

				//step3('GeoLite2-City-Blocks-IPv4.csv');
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
							done(err);
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
				console.log(GeoLite2Path); //path to current month in the folder caluated
				console.log('GeoLite2-City-Blocks-IPv4.csv later...');
			}
			else
			{

				if (!db)
				{
					log('Creating database and tables');
					db = new sqlite3.Database(dbFile);

					createSchema(db, log, function(err)
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

			}

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
