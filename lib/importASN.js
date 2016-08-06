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
        if (err) return doneCB(err);

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

        stmt = db.prepare('INSERT INTO asn (start, end, version, as_num, name) VALUES (?, ?, ?, ?, ?)', function(err)
        {
            if (err) return rollbackOnErr(err);

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
                        var AS_Str;
                        var AS_Num;
                        var ISPName;
                        var startIP;
                        var endIP;

                        if (version === 4)
                        {
                            startIP = ip.fromLong(data[0]);
                            endIP = ip.fromLong(data[1]);

                            AS_Str = data[2].split(' ');

                            AS_Num = AS_Str.shift();
                            ISPName = AS_Str.join(' ');

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
                            AS_Str = data[0].split(' ');

                            AS_Num = AS_Str.shift();
                            ISPName = AS_Str.join(' ');

                            startIP = data[1];
                            endIP = data[2];

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

        });

    });

};
