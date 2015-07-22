slimerjs
=========

[![npm version](https://badge.fury.io/js/slimerjs.svg)](https://www.npmjs.com/package/slimerjs)

An NPM wrapper for [SlimerJS](http://slimerjs.org/), a scriptable browser for web development and testing.

SlimerJS runs on Gecko, the browser engine behind [Mozilla Firefox](https://www.mozilla.org/en-US/firefox/new/), and aims to be a simple, drop-in replacement for [phantomjs](https://github.com/Medium/phantomjs). Because SlimerJS uses the version of firefox passed in the `SLIMERJSLAUNCHER` environment variable, edge builds of firefox can be used. This can be useful for viewing and testing modern web functionality which is [not yet available in phantomjs](https://github.com/ariya/phantomjs/issues/10031).


Building and Installing
-----------------------

```shell
npm install slimerjs
```

Or grab the source and

```shell
node ./install.js
```

What this is really doing is just grabbing a particular "blessed" (by
this module) version of Slimer. As new versions of Slimer are released
and vetted, this module will be updated accordingly.

The package has been set up to fetch and run Slimer for MacOS (darwin),
Linux based platforms (as identified by nodejs), and -- as of version 0.2.0 --
Windows (thanks to [Domenic Denicola](https://github.com/domenic)).  If you
spot any platform weirdnesses, let us know or send a patch.

Running
-------

```shell
bin/slimerjs [slimer arguments]
```

And npm will install a link to the binary in `node_modules/.bin` as
it is wont to do.

Running via node
----------------

The package exports a `path` string that contains the path to the
slimerjs binary/executable.

Below is an example of using this package via node.

```javascript
var path = require('path')
var childProcess = require('child_process')
var slimerjs = require('slimerjs')
var binPath = slimerjs.path

var childArgs = [
  path.join(__dirname, 'slimerjs-script.js'),
  'some other argument (passed to slimerjs script)'
]

childProcess.execFile(binPath, childArgs, function(err, stdout, stderr) {
  // handle results
})

```

Versioning
----------

The NPM package version tracks the version of SlimerJS that will be installed,
with an additional build number that is used for revisions to the installer.

As such `0.9.1-1` and `0.9.1-2` will both install SlimerJs 0.9.1 but the latter
has newer changes to the installer.

A Note on SlimerJS
-------------------

SlimerJS is not a library for NodeJS.  It's a separate environment and code
written for node is unlikely to be compatible.  In particular SlimerJS does
not expose a Common JS package loader.

This is an _NPM wrapper_ and can be used to conveniently make Slimer available
It is not a Node JS wrapper.

Standalone SlimerJS scripts can be driven from within a node program by spawning
SlimerJS in a child process.

Read the SlimerJS FAQ for more details: http://slimerjs.org/faq.html

Contributing
------------

Questions, comments, bug reports, and pull requests are all welcome.  Submit them at
[the project on GitHub](https://github.com/graingert/slimerjs/).

Bug reports that include steps-to-reproduce (including code) are the
best. Even better, make them in the form of pull requests.

Author
------

[Dan Pupius](https://github.com/dpup)
([personal website](http://pupius.co.uk)), supported by
[The Obvious Corporation](http://obvious.com/).

License
-------

Copyright 2012 [The Obvious Corporation](http://obvious.com/).

Licensed under the Apache License, Version 2.0.
See the top-level file `LICENSE.txt` and
(http://www.apache.org/licenses/LICENSE-2.0).
