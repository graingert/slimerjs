/**
 * Nodeunit functional tests.  Requires internet connection to validate slimer
 * functions correctly.
 */

var childProcess = require('child_process')
var fs = require('fs')
var path = require('path')
var webdriverio = require('webdriverio')
var slimerjs = require('../lib/slimerjs')
var util = require('../lib/util')

exports.testDownload = function (test) {
  test.expect(1)
  test.ok(fs.existsSync(slimerjs.path), 'Binary file should have been downloaded')
  test.done()
}

var baseArgs = [
  // run SlimerJS using virtual frame buffer (xvfb)
  '--auto-servernum',
  '--server-num=1',
  slimerjs.path,
]

exports.testSlimerExecutesTestScript = function (test) {
  test.expect(2)

  var childArgs = [
    // SlimerJS arguments
    path.join(__dirname, 'loadspeed.js'),
    'https://www.google.com/'
  ]

  childProcess.execFile('xvfb-run', baseArgs.concat(childArgs), function (err, stdout) {
    var value = (stdout.indexOf('msec') !== -1)
    test.ok(err === null, 'Test script should complete without errors')
    test.ok(value, 'Test script should have executed and returned run time')
    test.done()
  })
}


exports.testSlimerExitCode = function (test) {
  test.expect(1)
  childProcess.execFile('xvfb-run', baseArgs.concat([path.join(__dirname, 'exit.js')]), function (err) {
    test.equals(err.code, 123, 'Exit code should be returned from phantom script')
    test.done()
  })
}


exports.testBinFile = function (test) {
  test.expect(1)

  var binPath = process.platform === 'win32' ? 
      path.join(__dirname, '..', 'lib', 'slimer', 'slimerjs.exe') :
      path.join(__dirname, '..', 'bin', 'slimerjs')

  childProcess.execFile(binPath, ['--version'], function (err, stdout) {
    test.ok(stdout.trim().indexOf(slimerjs.version) >= -1, 'Version should be match')
    test.done()
  })
}


exports.testCleanPath = function (test) {
  test.expect(5)
  test.equal('/Users/dan/bin', slimerjs.cleanPath('/Users/dan/bin:./bin'))
  test.equal('/Users/dan/bin:/usr/bin', slimerjs.cleanPath('/Users/dan/bin:./bin:/usr/bin'))
  test.equal('/usr/bin', slimerjs.cleanPath('./bin:/usr/bin'))
  test.equal('', slimerjs.cleanPath('./bin'))
  test.equal('/Work/bin:/usr/bin', slimerjs.cleanPath('/Work/bin:/Work/slimerjs/node_modules/.bin:/usr/bin'))
  test.done()
}

exports.testBogusReinstallLocation = function (test) {
  util.findValidPhantomJsBinary('./blargh')
  .then(function (binaryLocation) {
    test.ok(!binaryLocation, 'Expected link to fail')
    test.done()
  })
}

exports.testSuccessfulReinstallLocation = function (test) {
  util.findValidPhantomJsBinary(path.resolve(__dirname, '../lib/location'))
  .then(function (binaryLocation) {
    test.ok(binaryLocation, 'Expected link to succeed')
    test.done()
  })
}

exports.testBogusVerifyChecksum = function (test) {
  util.verifyChecksum(path.resolve(__dirname, './exit.js'), 'blargh')
  .then(function (success) {
    test.ok(!success, 'Expected checksum to fail')
    test.done()
  })
}

exports.testSuccessfulVerifyChecksum = function (test) {
  util.verifyChecksum(path.resolve(__dirname, './exit.js'),
                      '31dfa8fd11176e00d29fa27aa32c5af64de46c121c059fe41c2543fcae4318fd')
  .then(function (success) {
    test.ok(success, 'Expected checksum to succeed')
    test.done()
  })
}

exports.testSlimerExec = function (test) {
  test.expect(1)
  var p = slimerjs.exec(path.join(__dirname, 'exit.js'))
  p.on('exit', function (code) {
    test.equals(code, 123, 'Exit code should be returned from phantom script')
    test.done()
  })
}

exports.testSlimerRun = function (test) {
  test.expect(1)
  var wdOpts = { desiredCapabilities: { browserName: 'slimerjs' } }
  slimerjs.run('--webdriver=4444').then(function (p) {
    webdriverio.remote(wdOpts).init()
      .url('https://developer.mozilla.org/en-US/')
      .getTitle().then(function (title) {
        test.equals(title, 'Mozilla Developer Network', 'Page title')
      })
      .then(function () {
        p.kill()
        test.done()
      })
  })
}

exports.testSlimerRunError = function (test) {
  test.expect(1)
  slimerjs.run('--bogus').then(function () {
    test.ok(false, 'Expected not to start')
    test.done()
  }, function (err) {
    test.equal('Error: Unknown option: bogus\n', err.message)
    test.done()
  })
}
