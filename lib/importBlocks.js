var readCSV = require('./readCSV.js'),
	progress = require('progrescii'),
	humanizeDuration = require('humanize-duration'),
	inet_pton = require('./inet_pton.js'),
	ip = require('ip');

module.exports = function(db, logFN, verbose, path, version, cb)
{
	var startTime = new Date();
	var downloadPBar = null;

	db.run('BEGIN TRANSACTION', function(err)
	{
		if (err)
		{
			cb(err);
		}
		else
		{
			rollbackOnErr = function(err)
			{
				db.run('ROLLBACK', function(err2)
				{
					cb(err);
				});

			};

			var stmt = db.prepare('INSERT INTO geo_blocks (start, end, version, geoname_id, registered_country_geoname_id, represented_country_geoname_id, is_anonymous_proxy, is_satellite_provider, postal_code, latitude, longitude, accuracy_radius) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', function(err)
			{
				if (err)
				{
					rollbackOnErr(err);
				}
				else
				{
					if (verbose)
					{
						downloadPBar = progress.create({
							size: 20,
							total: 100,
							pending: '░',
							complete: '█',
							template: 'Importing :b :p% in :ts'
							// Template Text tokens:
							//:b progress bar text
							//:p percentage Number
							//:t execution time
						});

					}

					var hadErr = false;
					var totalLines = 0;

					var dbInserts = 0;
					var dbInsertsFinished = 0;

					readCSV(
						path,
						function err(err)
						{
							hadErr = true;
							rollbackOnErr(err);
						},
						function line(handler, lineNum, data)
						{
							if (!hadErr)
							{
								var cidr = ip.cidrSubnet(data[0]);

								console.log(cidr.firstAddress, cidr.lastAddress);
								
								dbInserts++;

								stmt.run([
									inet_pton(cidr.firstAddress),
									inet_pton(cidr.lastAddress),
									version,
									data[1], //geoname_id
									data[2], //registered_country_geoname_id
									data[3], //represented_country_geoname_id
									data[4], //is_anonymous_proxy,
									data[5], //is_satellite_provider
									data[6], //postal_code
									data[7], //latitude
									data[8], //longitude
									data[9], //accuracy_radius
								], function(err)
								{
									if (err)
									{
										hadErr = true;
										handler.close();
										cb(err);
									}
									else
									{
										dbInsertsFinished++;

										if (downloadPBar)
										{
											downloadPBar.set(parseInt(((dbInsertsFinished / totalLines) * 100)));
										}

									}

								});

							}

						},
						function end()
						{
							if (!hadErr)
							{
								var timer = setInterval(function()
								{
									if (dbInserts === dbInsertsFinished)
									{
										clearInterval(timer);
										logFN('Commiting changes to geo_blocks table');
										db.run('COMMIT', function(err)
										{
											if (!err)
											{
												var totalMS = new Date().getTime() - startTime.getTime();

												logFN('Done importing file, Took ' + humanizeDuration(totalMS));
											}

											cb(err);
										});

									}

								}, 10);

							}

						},
						function count(num)
						{
							totalLines = num;
						},
						{skipHeader: true}
					);

				}

			});

		}

	});

};
