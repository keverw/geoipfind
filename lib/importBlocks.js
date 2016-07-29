var readCSV = require('./readCSV.js'),
	progress = require('progrescii'),
	humanizeDuration = require('humanize-duration'),
	inet_pton = require('./inet_pton.js');

var Address6 = require('ip-address').Address6;
var Address4 = require('ip-address').Address4;

module.exports = function(db, logFN, verbose, path, version, o_done_cb)
{
	var stmt = null;

	function doneCB(err)
	{
		if (stmt)
		{
			stmt.finalize(function(err)
			{
				o_done_cb(err);
			});

		}
		else
		{
			o_done_cb(err);
		}

	}

	////
	var startTime = new Date();
	var downloadPBar = null;

	db.run('BEGIN TRANSACTION', function(err)
	{
		if (err)
		{
			doneCB(err);
		}
		else
		{
			var rollbackOnErr = function(err)
			{
				if (!calledAlready)
				{
					calledAlready = true;

					db.run('ROLLBACK', function(err2)
					{
						doneCB(err);
					});

				}

			};

			stmt = db.prepare('INSERT INTO geo_blocks (start, end, version, geoname_id, registered_country_geoname_id, represented_country_geoname_id, is_anonymous_proxy, is_satellite_provider, postal_code, latitude, longitude, accuracy_radius) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', function(err)
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
								var firstAddress = '';
								var lastAddress = '';

								if (version == 4)
								{
									var address = new Address4(data[0]);
									firstAddress = address.startAddress().address;
									lastAddress = address.endAddress().address;
								}
								else if (version == 6)
								{
									var address = new Address6(data[0]);
									firstAddress = address.startAddress().address;
									lastAddress = address.endAddress().address;
								}
								else
								{
									hadErr = true;
									handler.close();
									rollbackOnErr(new Error('Incorrect IP version'));
								}

								dbInserts++;

								stmt.run([
									inet_pton(firstAddress),
									inet_pton(lastAddress),
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
										rollbackOnErr(err);
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

											doneCB(err);
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
