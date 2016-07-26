var geoipfind = require('../index.js');

geoipfind.buildDatabase('./db', {}, function(err)
{
	if (err)
	{
		console.log(cb);
	}

}, function(msg)
{
	//console.log(msg);
});
