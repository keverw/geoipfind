var countLinesInFile = require('count-lines-in-file'),
LineByLineReader = require('line-by-line');

module.exports = function(file, errCB, lineCB, endCB, countCB, options)
{
	options = options || {};

	var processdLines = 0;

	countLinesInFile(file, function(err, num)
	{
		if (err)
		{
			errCB(err);
		}
		else
		{
			if (options.skipHeader && num > 0) //don't count header
			{
				num--;
			}

			countCB(num);

			var lbl = new LineByLineReader(file);

			lbl.once('error', function(err)
			{
				errCB(err);
			});

			var sentFirstLine = false;

			lbl.on('line', function(line)
			{
				if (!sentFirstLine)
				{
					sentFirstLine = true;

					//totally skip this line
					if (options.skipHeader)
					{
						return;
					}
				}

				processdLines++;
				var split = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); //http://stackoverflow.com/questions/23582276/split-string-by-comma-but-ignore-commas-inside-quotes

				for (var key in split)
				{
					//if double quotes at start or end, remove them.
					if (split[key].charAt(0) === '"' && split[key].charAt(split[key].length-1) === '"')
					{
						split[key] = split[key].substr(1, split[key].length-2);
					}

				}
				
				lineCB(lbl, processdLines, split);
			});

			lbl.on('end', function()
			{
				lbl.removeAllListeners();
				endCB();
			});

		}

	});

};
