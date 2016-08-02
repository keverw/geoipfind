var geoipfind = require('../index.js');

var geoIP = geoipfind.geoIP('./db');

// var geoIP = geoipfind.geoIP('./db', function(err)
// {
//     console.log(err);
// });

// geoIP.findISP('127.0.0.1', function(err, found, result)
// {
//     console.log(err, found, result);
// });

//findLoc
geoIP.findLoc('8.8.8.8', function(err, found, result)
{
    console.log(err, found, result);
});

//geoIP.close();

// geoIP.close(function(err)
// {
//     console.log(err);
// });
