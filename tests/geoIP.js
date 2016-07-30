var geoipfind = require('../index.js');

//var geoIP = geoipfind.geoIP('./db');

var geoIP = geoipfind.geoIP('./db', function(err)
{
	console.log(err);
});
