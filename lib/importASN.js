var readCSV = require('./readCSV.js'),
	inet_pton = require('./inet_pton.js'),
	ip = require('ip');

module.exports = function(db, logFN, verbose, path, version, cb)
{
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

			//todo: progress bar?
			//todo: track how long it took

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
