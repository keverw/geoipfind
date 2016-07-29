var geoipfind = require('../index.js');

geoipfind.buildDatabase('./db', {
	//verbose: false,
	memory: true
}, function(err)
{
	if (err)
	{
		console.log('buildDatabase:', err);
	}

}, function(msg)
{
	//console.log(msg);
});
