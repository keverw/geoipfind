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
						if (version === 4)
						{
							var startIP = ip.fromLong(data[0]);
							var endIP = ip.fromLong(data[1]);
							var AS_Str = data[2].slice(1, -1).split(' ');

							var AS_Num = AS_Str.shift();
							var ISPName = AS_Str.join(' ');

							dbInserts++;

							db.run('INSERT INTO asn (start, end, version, as_num, name) VALUES (?, ?, ?, ?, ?)', [
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
						else if (version === 6)
						{
							var AS_Str = data[0].slice(1, -1).split(' ');

							var AS_Num = AS_Str.shift();
							var ISPName = AS_Str.join(' ');

							var startIP = data[1];
							var endIP = data[2];

							dbInserts++;

							db.run('INSERT INTO asn (start, end, version, as_num, name) VALUES (?, ?, ?, ?, ?)', [
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
								logFN('Commiting changes to asn table');
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
				}
			);

		}

	});

};
