# GeoIPFind v0.0.1
[![npm version](https://badge.fury.io/js/geoipfind.svg)](https://badge.fury.io/js/geoipfind) &nbsp; [![Build Status](https://travis-ci.org/keverw/geoipfind.svg?branch=master)](https://travis-ci.org/keverw/geoipfind)

Simple IP-based geolocation lookup for ISP, country, city, timezone, etc. This has two parts: buildDatabase which downloads the data and builds a self-containing database. Secondly, it has lookup functions to query this database. So once the database is successfully built, you don't have to rely on any third parties.

I found tons of modules for GEO Location but searching "geolocation ISP" and "geo location ISP". I couldn't find any that would return the ISP also. So I built this to return the stuff generally returned by GEOIP modules but also returns ISP info.

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Install](#install)
- [buildDatabase](#builddatabase)
  - [options](#options)
    - [Database Build Times](#database-build-times)
- [geoIP](#geoip)
  - [findISP](#findisp)
  - [findLoc](#findloc)
  - [find](#find)
  - [Close](#close)
- [License](#license)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Install

To set up geoipfind on your Node.js server use npm.

`npm install geoipfind`

## buildDatabase
`buildDatabase(databaseLocation, options, cb, logCB)`

Before you can use the geoIP lookup functions, you must build the database first. This function will simply build the SQLite database. The free database is updated on the first Tuesday of each month, so probably on the first Wednesday of every month you should build a new version of the database and include it in your next code deploy. I personally will probably use this in a microservice separate from my main codebase for the most flexibility.

Using SQLite for this since no need to depend on a networked database as once the database is built it's read only. So perfect for a self-containing service.

* `databaseLocation`: This should be a folder where the SQLite database is stored, and temporary files while being built
* `options`: This a object containing options
* `cb`: Callback when done. If successful, `err` will be null.
* `logCB`: Optional callback with plain text logs

This uses [cross-zip](https://github.com/feross/cross-zip). On Windows This package requires [.NET Framework 4.5 or later](https://www.microsoft.com/net)
and [Powershell 3](https://www.microsoft.com/en-us/download/details.aspx?id=34595).
These come **pre-installed** on Windows 8 or later.

On Windows 7 or earlier, you will need to install these manually in order for
`cross-zip` to function correctly.

On `*nix` based operating systems make sure you have a unzip command line tool installed.

When installing on Ubuntu make sure the nodejs path is set so SQLite will be built. Make sure there's also a unzip command.

apt-get install git nodejs npm unzip
sudo ln -fs /usr/bin/nodejs /usr/local/bin/node

### options
* `verbose`: To output to the console, defaults to true
* `memory`: When set to a truthy value, to will set SQLite to work in memory. Defaults to true

#### Database Build Times

Once the database is done building, it will created a 839.8 MB file, this file will probably grow over time if data is added to the sources over time upon future rebuilds. It took about 37 minutes on my MacBook Node v4.4.5. You should obviously have a couple of gigabytes to build the database.

I also tested on a 2GB Linode and it took 28 minutes using Ubuntu 16.04 x64 in Frankfurt with Node v4.2.6.
I also tested on a 2GB Digital Ocean Droplet using Ubuntu 16.04 x64 in Frankfurt and it took 36 minutes with Node v4.2.6.

In my build, it created 7,264,019 records. So the average time per record created across all 3 tests would be 3,669 every second to put things into perspective. So I'd say the build time is pretty reasonable at this point considering this is single threaded and this isn't a daily thing to run. Consider it to be comparable to compiling a large C or C++ program.

## geoIP
`geoIP(databaseLocation)`

After you have built the database, you must open the database to query it to use the geoIP lookup functions.

Pass in the same folder you passed into `buildDatabase`

```js
var geoIP = geoipfind.geoIP('./db');
```

if SQLite has trouble opening the database it will throw an error. If you prefer to have a callback on trouble opening, you can pass an optional callback as the last parameter.

```js
var geoIP = geoipfind.geoIP('./db', function(err)
{
    console.log(err);
});
```

### findISP
```js
geoIP.findISP('IP Address Here', function(err, found, result)
{
    console.log(err, found, result);
});
```

If err, both found and result will be null or undefined.
if found the object looks like:

```
{ ver: 4,
  is_private: false,
  asn: 'AS10796',
  name: 'Time Warner Cable Internet LLC' }
```

If not found it will return a object with ver only.

### findLoc
Look up a location for a IP address.

```js
geoIP.findLoc('IP Address Here', function(err, found, result)
{
    console.log(err, found, result);
});
```

Note: that not all records have city, subdivisions, postal_code, time_zone, etc records especially IPv6 at this point. So before reading something, you should check for it. Also not all records such as subdivision2 returns a geoname_id

When a result is found, it returns a result like this:

```
null true { ver: 4,
  is_private: false,
  is_anonymous_proxy: 0,
  is_satellite_provider: 0,
  continent:
   { geoname_id: 6255149,
     code: 'NA',
     name: 'North America',
     names:
      { de: 'Nordamerika',
        en: 'North America',
        es: 'Norteamérica',
        fr: 'Amérique du Nord',
        ja: '北アメリカ',
        'pt-BR': 'América do Norte',
        ru: 'Северная Америка',
        'zh-CN': '北美洲' } },
  country:
   { geoname_id: 6252001,
     iso_code: 'US',
     name: 'United States',
     names:
      { de: 'USA',
        en: 'United States',
        es: 'Estados Unidos',
        fr: 'États-Unis',
        ja: 'アメリカ合衆国',
        'pt-BR': 'Estados Unidos',
        ru: 'США',
        'zh-CN': '美国' } },
  city:
   { geoname_id: 5375480,
     name: 'Mountain View',
     names:
      { de: 'Mountain View',
        en: 'Mountain View',
        es: null,
        fr: 'Mountain View',
        ja: 'マウンテンビュー',
        'pt-BR': null,
        ru: 'Маунтин-Вью',
        'zh-CN': '芒廷维尤' } },
  location:
   { accuracy_radius: 1000,
     latitude: 37.386,
     longitude: 37.386,
     metro_code: '807',
     time_zone: 'America/Los_Angeles' },
  postal: { code: '94035' },
  registered_country:
   { geoname_id: 6252001,
     iso_code: 'US',
     name: 'United States',
     names:
      { de: 'USA',
        en: 'United States',
        es: 'Estados Unidos',
        fr: 'États-Unis',
        ja: 'アメリカ合衆国',
        'pt-BR': 'Estados Unidos',
        ru: 'США',
        'zh-CN': '美国' } },
  subdivisions:
   [ { geoname_id: 5332921,
       iso_code: 'CA',
       name: 'California',
       names: [Object] } ] }
```

OR

```
null true { ver: 6,
  is_private: false,
  is_anonymous_proxy: 0,
  is_satellite_provider: 0,
  continent:
   { geoname_id: 6255149,
     code: 'NA',
     name: 'North America',
     names:
      { de: 'Nordamerika',
        en: 'North America',
        es: 'Norteamérica',
        fr: 'Amérique du Nord',
        ja: '北アメリカ',
        'pt-BR': 'América do Norte',
        ru: 'Северная Америка',
        'zh-CN': '北美洲' } },
  country:
   { geoname_id: 6252001,
     iso_code: 'US',
     name: 'United States',
     names:
      { de: 'USA',
        en: 'United States',
        es: 'Estados Unidos',
        fr: 'États-Unis',
        ja: 'アメリカ合衆国',
        'pt-BR': 'Estados Unidos',
        ru: 'США',
        'zh-CN': '美国' } },
  location: { accuracy_radius: 100, latitude: 39.76, longitude: 39.76 },
  registered_country:
   { geoname_id: 6252001,
     iso_code: 'US',
     name: 'United States',
     names:
      { de: 'USA',
        en: 'United States',
        es: 'Estados Unidos',
        fr: 'États-Unis',
        ja: 'アメリカ合衆国',
        'pt-BR': 'Estados Unidos',
        ru: 'США',
        'zh-CN': '美国' } } }
```

### find

Same as find but also includes a `isp` key to the object if a result is found.
```
null true { ver: 4,
  is_private: false,
  is_anonymous_proxy: 0,
  is_satellite_provider: 0,
  continent:
   { geoname_id: 6255149,
     code: 'NA',
     name: 'North America',
     names:
      { de: 'Nordamerika',
        en: 'North America',
        es: 'Norteamérica',
        fr: 'Amérique du Nord',
        ja: '北アメリカ',
        'pt-BR': 'América do Norte',
        ru: 'Северная Америка',
        'zh-CN': '北美洲' } },
  country:
   { geoname_id: 6252001,
     iso_code: 'US',
     name: 'United States',
     names:
      { de: 'USA',
        en: 'United States',
        es: 'Estados Unidos',
        fr: 'États-Unis',
        ja: 'アメリカ合衆国',
        'pt-BR': 'Estados Unidos',
        ru: 'США',
        'zh-CN': '美国' } },
  city:
   { geoname_id: 5375480,
     name: 'Mountain View',
     names:
      { de: 'Mountain View',
        en: 'Mountain View',
        es: null,
        fr: 'Mountain View',
        ja: 'マウンテンビュー',
        'pt-BR': null,
        ru: 'Маунтин-Вью',
        'zh-CN': '芒廷维尤' } },
  location:
   { accuracy_radius: 1000,
     latitude: 37.386,
     longitude: 37.386,
     metro_code: '807',
     time_zone: 'America/Los_Angeles' },
  postal: { code: '94035' },
  registered_country:
   { geoname_id: 6252001,
     iso_code: 'US',
     name: 'United States',
     names:
      { de: 'USA',
        en: 'United States',
        es: 'Estados Unidos',
        fr: 'États-Unis',
        ja: 'アメリカ合衆国',
        'pt-BR': 'Estados Unidos',
        ru: 'США',
        'zh-CN': '美国' } },
  subdivisions:
   [ { geoname_id: 5332921,
       iso_code: 'CA',
       name: 'California',
       names: [Object] } ],
  isp: { asn: 'AS15169', name: 'Google Inc.' } }
```

### Close
Closes the database. Callback is optional

```js
geoIP.close();
```

or

```js
geoIP.close(function(err)
{
    console.log(err);
});
```

## License
This module(the code) itself is under BSD license like I usually use.

However, when building the database it makes use of the [GeoLite ASN and GeoLite ASN IPv6 databases](http://dev.maxmind.com/geoip/legacy/geolite/) from MaxMind. Along with the [GeoLite2 City](http://dev.maxmind.com/geoip/geoip2/geolite2/) database. Both which are under the [Creative Commons Attribution-ShareAlike 4.0 International License](http://creativecommons.org/licenses/by-sa/4.0/). Also geolite2 includes GeoNames data

The attribution requirement may be met by including the following in all advertising and documentation mentioning features of or use of this database:

```
This product includes GeoLite and GeoLite2 data created by MaxMind, available from
<a href="http://www.maxmind.com">http://www.maxmind.com</a>. This work is licensed
under the Creative Commons Attribution-ShareAlike 4.0 International License.

To view a copy of this license, visit http://creativecommons.org/licenses/by-sa/4.0/.

This database incorporates GeoNames [http://www.geonames.org] geographical data,
which is made available under the Creative Commons Attribution 3.0 License.

To view a copy of this license, visit http://www.creativecommons.org/licenses/by/3.0/us/.
```

This is their standard disclaimer advice, other than I added the "and" part since this is using both databases. One mainly for city lookup, and the other for ISP since GeoLite2 doesn't include ASN data. Also added the GeoNames disclaimer too.

MaxMind also offers [commercial redistribution licensing](https://www.maxmind.com/en/geolite2-developer-package).
