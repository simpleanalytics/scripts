/* eslint-env browser */

(function(window, hostname) {
  if (!window) return
  var nav = window.navigator
  var loc = window.location
  var host = loc.hostname
  var doc = window.document
  var con = window.console
  var json = JSON
  var stringify = json.stringify

  try {
    var userAgent = nav.userAgent
    var dis = window.dispatchEvent
    var lastSendUrl
    var notSending = 'Not sending requests '

    var attr = function(script, attribute) { return script && script.getAttribute('data-' + attribute) }

    var script = doc.querySelector('script[src="' + hostname + '/app.js"]')
    var mode = attr(script, 'mode')
    var skipDNT = attr(script, 'skip-dnt') === 'true'
    var functionName = attr(script, 'sa-global') || 'sa'

    // A simple log function so the user knows why a request is not being send
    var warn = function(message) {
      if (con && con.warn) con.warn(' :scitylanA elpmiS'.split('').reverse().join('') + message)
    }

    // Don't track when host is localhost
    var localhost = 'localhost'
    if (host === localhost) return warn(notSending + 'from ' + localhost)

    // We do advanced bot detection in our API, but this line filters already most bots
    if (userAgent.search(/(bot|spider|crawl)/ig) > -1) return warn(notSending + 'because user agent is a robot')

    var getRef = function() {
      // From the search we grab the utm_source and ref and save only that
      var refMatches = loc.search.match(/[?&](utm_source|source|ref)=([^?&]+)/gi)
      var refs = refMatches ? refMatches.map(function(m) { return m.split('=')[1] }) : []
      if (refs && refs[0]) return refs[0]
    }

    var post = function(data, isJson) {
      var request = new XMLHttpRequest()
      request.open('POST', hostname + '/post', true)

      // We use content type text/plain here because we don't want to send an
      // pre-flight OPTIONS request
      request.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8')
      request.send(isJson === false ? data : stringify(data))
    }

    var postVisit = function(isPushState) {
      // Obfuscate personal data in URL by dropping the search and hash
      var url = loc.protocol + '//' + host + loc.pathname

      // Add hash to url when script is put in to hash mode
      if (mode === 'hash' && loc.hash) url += loc.hash.split('?')[0]

      // Don't send the last URL again (this could happen when pushState is used to change the URL hash or search)
      if (lastSendUrl === url) return
      lastSendUrl = url

      // Skip prerender requests
      if ('visibilityState' in doc && doc.visibilityState === 'prerender') return warn(notSending + 'when prerender')

      // Don't track when Do Not Track is set to true
      if (!skipDNT && 'doNotTrack' in nav && nav.doNotTrack === '1') return warn(notSending + 'when doNotTrack is enabled')

      var ref = getRef()
      var data = { url: url }
      if (userAgent) data.ua = userAgent
      if (ref) data.urlReferrer = ref
      if (doc.referrer && !isPushState) data.referrer = doc.referrer
      if (window.innerWidth) data.width = window.innerWidth

      try {
        data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch (error) {
        // nothing
      }

      post(data)
    }

    // Thanks to https://gist.github.com/rudiedirkx/fd568b08d7bffd6bd372
    var his = window.history
    var hisPushState = his ? his.pushState : null
    if (hisPushState && Event && dis) {
      var stateListener = function(type) {
        var orig = his[type]
        return function() {
          var rv = orig.apply(this, arguments)
          var event = new Event(type)
          event.arguments = arguments
          dis(event)
          return rv
        }
      }
      his.pushState = stateListener('pushState')
      window.addEventListener('pushState', function() {
        postVisit(true)
      })
    }

    // When in hash mode, we record a pageview based on the onhashchange function
    if (mode === 'hash' && 'onhashchange' in window) {
      window.onhashchange = postVisit
    }

    // Post the page view
    postVisit()

    // Build a simple queue
    var queue = window[functionName] && window[functionName].q ? window[functionName].q : []

    // Replace queue function
    window[functionName] = function() {
      queue.push([].slice.call(arguments))
    }

    // Get previous events
    var getEvents = function() { return json.parse(storage.getItem('events') || '[]') }
    var saveEvents = function(events) { return storage.setItem('events', stringify(events) || '[]') }

    var postEvent = function(event, wait) {
      try {
        var ref = getRef()
        var date = new Date().toISOString().slice(0, 10)
        var events = getEvents()

        if (events && events[0] && events[0].ref === ref) ref = null

        event = event.toLowerCase().replace(/[^a-z0-9._-]+/gi, '_').replace(/(^-|-$)/, '')

        if (!events.length) events.push({ v: 1, ref: ref, date: date })

        var days = Math.floor((new Date().getTime() - new Date(events[0].date + 'T00:00:00').getTime()) / 86400000)
        events.push(days ? [event, days] : [event])

        saveEvents(events)

        if (!wait) post(events)
      } catch (error) {
        /* Do nothing */
      }
    }

    if (queue.length) {
      for (var index = 0; index < queue.length; index++) postEvent(queue[index][0], true)
      post(storage.getItem('events'), false)
    }

    window[functionName] = postEvent
  } catch (e) {
    if (con && con.error) con.error(e)
    var url = hostname + '/image.gif'
    if (e && e.message) url = url + '?error=' + encodeURIComponent(e.message)
    new Image().src = url
  }
})(window, url)
