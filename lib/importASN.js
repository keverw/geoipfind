var readCSV = require('./readCSV.js'),
	progress = require('progrescii'),
	humanizeDuration = require('humanize-duration'),
	inet_pton = require('./inet_pton.js'),
	ip = require('ip');

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

			stmt = db.prepare('INSERT INTO asn (start, end, version, as_num, name) VALUES (?, ?, ?, ?, ?)', function(err)
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
								
								if (version === 4)
								{
									var startIP = ip.fromLong(data[0]);
									var endIP = ip.fromLong(data[1]);
									var AS_Str = data[2].slice(1, -1).split(' ');

									var AS_Num = AS_Str.shift();
									var ISPName = AS_Str.join(' ');

									dbInserts++;

									stmt.run([
										inet_pton(startIP),
										inet_pton(endIP),
										4,
										AS_Num,
										ISPName
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
								else if (version === 6)
								{
									var AS_Str = data[0].slice(1, -1).split(' ');

									var AS_Num = AS_Str.shift();
									var ISPName = AS_Str.join(' ');

									var startIP = data[1];
									var endIP = data[2];

									dbInserts++;

									stmt.run([
										inet_pton(startIP),
										inet_pton(endIP),
										6,
										AS_Num,
										ISPName
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
										logFN('Committing changes to asn table');
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
						}
					);

				}

			});

		}

	});

};
