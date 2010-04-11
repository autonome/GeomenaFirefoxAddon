/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 * 
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Geomena.
 *
 * The Initial Developer of the Original Code is
 * your mom.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * 
 * ***** END LICENSE BLOCK ***** */

/*

TODO:
- on shutdown, uninit
- toggle watcher on network on/offline events
*/


const EXPORTED_SYMBOLS = ["geomena"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "wifiMonitor",
                                   "@mozilla.org/wifi/monitor;1",
                                   "nsIWifiMonitor");

XPCOMUtils.defineLazyServiceGetter(this, "geolocation",
                                   "@mozilla.org/geolocation;1",
                                   "nsIDOMGeoGeolocation");  

var geomena = {
  init: function() {
    wifiMonitor.startWatching(this);
    // replace with no-op so we only init once
    this.init = function() {};
  },

  uninit: function() {
    wifiMonitor.stopWatching(this);
  },

  // nsIWifiListener
  onChange: function (accessPoints) {
    var apInfo = [];
    accessPoints.forEach(function(ap) {
      apInfo.push({
        mac: ap.mac,
        ssid: ap.ssid,
        signal: ap.signal
      });
    });
    if (apInfo.length)
      this.uploadAccessPointInfo(apInfo);
  },
  onError: function (value) {},
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIWifiListener]),

  uploadAccessPointInfo: function(accessPoints) {
    var self = this;
    geolocation.getCurrentPosition(function(position) {  
      self.uploadToGeomena(position, accessPoints);
    })
  },

  // API documented at:
  // http://bitbucket.org/donpdonp/geomena/wiki/APIReference
  uploadToGeomena: function(geodata, accessPoints) {
    accessPoints.forEach(function(ap) {
      var url = "http://geomena.org/ap/" + ap.mac;
      var params = [
        "latitude=", geodata.coords.latitude,
        "&longitude=", geodata.coords.longitude,
        "&essid=", geodata.coords.ssid].join();
      var req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].
                createInstance(Ci.nsIXMLHttpRequest);  
      req.open("POST", url, true);  
      req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
      req.setRequestHeader("Content-length", params.length);
      req.setRequestHeader("Connection", "close");
      LOG(url + "?" + params);
      //req.send(params);  
    });
  },

  // test fetching current connection information (linux)
  test: function(e) {
    this.executeShellCommand("/sbin/iwconfig", function(topic, retval) { LOG([topic, ': ', retval].join()); });
  },

  // execute a shell command
  //
  // aCallback is a function signature myCallback(string status, string output)
  // where status is a string indicating if the command was able to be executed
  // and output is the string output of the command itself.
  executeShellCommand: function(aCmd, aCallback) {
    // create an nsILocalFile for the executable
    var file = Components.classes["@mozilla.org/file/local;1"]
                         .createInstance(Components.interfaces.nsILocalFile);
    file.initWithPath("/bin/bash");

    // create an nsIProcess
    var process = Components.classes["@mozilla.org/process/util;1"]
                            .createInstance(Components.interfaces.nsIProcess);
    process.init(file);

    // ghetto-style output fetching
    var tempFileName = "tmp.txt"; // Date.now();
    var tempFilePath = "/tmp/" + tempFileName;
    var args = ["-c", aCmd + " > " + tempFilePath];

    // Run the process.
    // If first param is true, calling thread will be blocked until
    // called process terminates.
    // Second and third params are used to pass command-line arguments
    // to the process.
    var self = this;
    process.runAsync(args, args.length, {
      observe: function(subject, topic, data) {
        process = subject.QueryInterface(Components.interfaces.nsIProcess);
        var tempFile = Components.classes["@mozilla.org/file/local;1"]
                   .createInstance(Components.interfaces.nsILocalFile);
        tempFile.initWithPath(tempFilePath);
        var output = self.getFileContents(tempFile); 
        aCallback(topic, output);
      }
    });
  },

  // helper to read the contents of a file and return it as a string                       
  getFileContents: function(aFile) {
    var fstream = Cc["@mozilla.org/network/file-input-stream;1"].
                  createInstance(Ci.nsIFileInputStream);
    fstream.init(aFile, -1, 0, 0);

    var cstream = Cc["@mozilla.org/intl/converter-input-stream;1"].
                  createInstance(Ci.nsIConverterInputStream);
    cstream.init(fstream, "UTF-8", 0, 0);

    var string  = {};
    cstream.readString(-1, string);
    cstream.close();
    return string.value;
  }
};

function LOG(aMsg) {
  dump(aMsg + "\n");
  Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService).logStringMessage("Geomena: " + aMsg);
}
