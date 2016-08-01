var readCSV = require('./readCSV.js'),
	progress = require('progrescii'),
	humanizeDuration = require('humanize-duration'),
	async = require('async');

	module.exports = function(db, logFN, verbose, path, lang, o_done_cb)
	{
		var statements = { //statements to create
			geo_namesSelect: 'select geoname_id from geo_names WHERE geoname_id = ? LIMIT 1',
			geo_namesInsert: 'INSERT OR IGNORE INTO geo_names (geoname_id, type, geo_lookup, continent_code, country_iso_code, subdivision_1_iso_code, subdivision_2_iso_code, metro_code, time_zone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
			langCheck_select: 'SELECT field, code FROM lang WHERE field = ? AND code = ?',
			lang_insert: 'INSERT OR IGNORE INTO lang (`field`, `code`, `lookup_code`, `' + lang + '`) VALUES (?, ?, ?, ?)',
			lang_update: 'UPDATE lang SET `' + lang + '` = ? WHERE field = ? AND code = ?'
		};

		var stmt = {}; //prepared statement store

		function doneCB(err)
		{
			//finalize statements
			async.eachOfSeries(stmt, function(value, key, callback)
			{
				if (value)
				{
					stmt[key].finalize(function(err)
					{
						callback(err);
					});

				}
				else
				{
					callback(null);
				}

			}, function done(err) //statements prepared
			{
				o_done_cb(err);
			});

		}

		////
		var startTime = new Date();
		var downloadPBar = null;

		logFN('Importing GEO Names database - ' + lang);

		db.run('BEGIN TRANSACTION', function(err)
		{
			if (err)
			{
				doneCB(err);
			}
			else
			{
				var calledAlready = false;

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

				//prepare statements
				async.eachOfSeries(statements, function(value, key, callback)
				{
					stmt[key] = db.prepare(value, function(err)
					{
						callback(err);
					});

				}, function done(err) //statements prepared
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

						var processLang = function(langData, cb)
						{
							async.eachOfSeries(langData, function(value, key, callback)
							{

								stmt.langCheck_select.get([value.field, value.code], function (err, row)
								{
									if (err)
									{
										callback(err);
									}
									else if (row) //already inserted, update
									{

										stmt.lang_update.run([value.value, value.field, value.code], function(err)
										{
											callback(err);
										});

									}
									else //not inserted, insert
									{

										stmt.lang_insert.run([value.field, value.code, value.lookup_code, value.value], function(err)
										{
											callback(err);
										});

									}

								});

							}, function done(err)
							{
								cb(err);
							});

						};

						var progressBarLast = 0;

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
									var geoname_id = data[0];
									var locale_code = data[1];
									var continent_code = data[2];
									var continent_name = data[3];
									var country_iso_code = data[4];
									var country_name = data[5];
									var subdivision_1_iso_code = data[6];
									var subdivision_1_name = data[7];
									var subdivision_2_iso_code = data[8];
									var subdivision_2_name = data[9];
									var city_name = data[10];
									var metro_code = data[11];
									var time_zone = data[12];

									var geo_type = 0; //unknown
									var geo_lookup = ''

									if (continent_code.length > 0 && country_iso_code == '' && subdivision_1_iso_code == '' && subdivision_2_iso_code == '' && city_name == '')
									{
										geo_type = 1; //continent
										geo_lookup = [geo_type, continent_code].join('.');
									}
									else if (continent_code.length > 0 && country_iso_code.length > 0 && subdivision_1_iso_code == '' && subdivision_2_iso_code == '' && city_name == '')
									{
										geo_type = 2; //country
										geo_lookup = [geo_type, continent_code, country_iso_code].join('.');
									}
									else if (continent_code.length > 0 && country_iso_code.length > 0 && subdivision_1_iso_code.length > 0 && subdivision_2_iso_code == '' && city_name == '')
									{
										geo_type = 3; //subdivisions 1
										geo_lookup = [geo_type, continent_code, country_iso_code, subdivision_1_iso_code].join('.');
									}
									else if (continent_code.length > 0 && country_iso_code.length > 0 && subdivision_1_iso_code.length > 0 && subdivision_2_iso_code.length > 0 && city_name == '')
									{
										geo_type = 4; //subdivisions 2
										geo_lookup = [geo_type, continent_code, country_iso_code, subdivision_1_iso_code, subdivision_2_iso_code].join('.');
									}
									else if (continent_code.length > 0 && country_iso_code.length > 0 && city_name.length > 0)
									{
										geo_type = 5; //city
										geo_lookup = [geo_type, continent_code, country_iso_code, geoname_id].join('.');
									}
									
									dbInserts++;

									stmt.geo_namesSelect.get([geoname_id], function (err, row)
									{
										if (err)
										{
											hadErr = true;
											handler.close();
											rollbackOnErr(err);
										}
										else
										{
											var langData = [];

											//continent_name
											langData.push({
												field: 'continent_name',
												code: continent_code,
												lookup_code: continent_code,
												value: continent_name,
											});

											//country_name
											if (country_iso_code.length > 0 && country_name.length > 0)
											{
												langData.push({
													field: 'country_name',
													code: country_iso_code,
													lookup_code: [continent_code, country_iso_code].join('.'),
													value: country_name
												});

											}

											if (subdivision_1_iso_code.length > 0 && subdivision_1_name.length > 0)
											{
												langData.push({
													field: 'subdivision_1_name',
													code: subdivision_1_iso_code,
													lookup_code: [continent_code, country_iso_code, subdivision_1_iso_code].join('.'),
													value: subdivision_1_name
												});

											}

											if (subdivision_2_iso_code.length > 0 && subdivision_2_name.length > 0)
											{
												langData.push({
													field: 'subdivision_2_name',
													code: subdivision_2_iso_code,
													lookup_code: [continent_code, country_iso_code, subdivision_1_iso_code, subdivision_2_iso_code].join('.'),
													value: subdivision_2_name
												});

											}

											if (geoname_id.length > 0 && city_name.length > 0)
											{
												langData.push({
													field: 'city_name',
													code: geoname_id,
													lookup_code: geoname_id,
													value: city_name
												});

											}

											if (row) //already inserted
											{
												processLang(langData, function(err)
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

														var precent = Math.floor(((dbInsertsFinished / totalLines) * 100));
														if (progressBarLast != precent)
														{
															progressBarLast = precent;
															logFN('Importing ' + precent + '%', true);

															if (downloadPBar)
															{
																downloadPBar.set(precent);
															}
														}

													}

												});

											}
											else //not already inserted
											{
												stmt.geo_namesInsert.run([
													geoname_id,
													geo_type,
													geo_lookup,
													continent_code,
													country_iso_code,
													subdivision_1_iso_code,
													subdivision_2_iso_code,
													metro_code,
													time_zone
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
														processLang(langData, function(err)
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

																var precent = Math.floor(((dbInsertsFinished / totalLines) * 100));
																if (progressBarLast != precent)
																{
																	progressBarLast = precent;
																	logFN('Importing ' + precent + '%', true);

																	if (downloadPBar)
																	{
																		downloadPBar.set(precent);
																	}
																}

															}

														});

													}

												});

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
											logFN('Committing changes to geo_names and lang table');
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
