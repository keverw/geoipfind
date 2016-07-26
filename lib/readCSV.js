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

				var split = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); //http://stackoverflow.com/questions/23582276/split-string-by-comma-but-ignore-commas-inside-quotes

				lineCB(lbl, processdLines, split);
			});

			lbl.on('end', function()
			{
				endCB();
			});

		}

	});

};
