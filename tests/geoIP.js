var geoipfind = require('../index.js');

var geoIP = geoipfind.geoIP('./db');

// var geoIP = geoipfind.geoIP('./db', function(err)
// {
// 	console.log(err);
// });

geoIP.findISP('', function(err, result)
{
	console.log(err, result);
});

//geoIP.close();

// geoIP.close(function(err)
// {
// 	console.log(err);
// });
