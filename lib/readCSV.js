var countLinesInFile = require('count-lines-in-file'),
LineByLineReader = require('line-by-line');

module.exports = function(file, errCB, lineCB, endCB, countCB)
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

};
