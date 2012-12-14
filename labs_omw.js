// Auth vars - These should be moved into a servlet
var ywsid = '';
var yelp_auth = {
	consumerKey: "H2IHDcuj5agidl6zHH3nXQ",
	consumerSecret: "l4effQo1uQx906Ze2PitmpUNvYk",
	accessToken: "8QI9can4xZ4cX-qmIEPDQUiqGtBPpIUb",
	accessTokenSecret: "n45eiFuRreGhRBulyuAXASG_hiw",
	serviceProvider: {
	  signatureMethod: "HMAC-SHA1"
	}
};

var accessor = {
  consumerSecret: yelp_auth.consumerSecret,
  tokenSecret: yelp_auth.accessTokenSecret
};


// Global bars
var map;
var directionService;
var directionsRenderer;
var routeBoxer;
var KMTOMI = 1.609344;
var tileSize = 20 * KMTOMI; // km -> mi
var yelpMapIcon = "../img/map/map_marker_star_shadow.png";

var distanceDist = 0;

var sourceInput;
var destInput;

// Hack vars
var currentlyOpenInfoWindow = null;
var currentMarkerInstances = [];

// Temp vars
var tempBoxes;

function setupAutoComplete() {
	/* restrict to multiple cities? */
	var options = {
		componentRestrictions: {country: "us"}
	};

	var sourceAutocomplete = new google.maps.places.Autocomplete(sourceInput, options);
	var destAutocomplete = new google.maps.places.Autocomplete(destInput, options);
}

function setupDirectionsRouter(map) {
	directionService = new google.maps.DirectionsService();
	directionsRenderer = new google.maps.DirectionsRenderer({ map: map });
	routeBoxer = new RouteBoxer();
}

function hideAlertBox() {
	$("#alert_button").hide();
}

function initialize() {
	var mapOptions = {
		center: new google.maps.LatLng(37.77501, -122.41826),
		zoom: 8,
		mapTypeId: google.maps.MapTypeId.ROADMAP
	};
	map = new google.maps.Map(document.getElementById("map_canvas"), mapOptions);

	// Global vars
	sourceInput = document.getElementById('start_location');
	destInput = document.getElementById('dest_location');

	// .click() functions
	$("#search_omw").click(function() {
		searchOMW();
	});

	$("#alert_box_dismiss").click(function() {
		hideAlertBox();
	});

	google.maps.event.addListener(map, 'click', function() {
		//console.log('here');
		closeCurrentInfoWindow();
	 });

	$("#category_filters > .btn").click(function() {
		$(this).toggleClass("active");
	});

	$("#remove_filters").click(function() {
		$("#category_filters > .btn").removeClass("active");
	});

	// Hide more options be default

	// setup auto complete
	setupAutoComplete();
}

function routeDirections(map){
	if(directionService === null || directionsRenderer === null) {
		setupDirectionsRouter(map);
	}
}

function updateUsingRouteResult(result) {
	distanceToDest = result.routes[0].legs[0].distance.value * 0.000625; // m -> mi
	timeToDest = result.routes[0].legs[0].duration.value; // sec

	// Linear equation
	tileSize = (0.5/11.6) * distanceToDest + 0.05;
	console.log(distanceToDest + " mi and "+ timeToDest + " sec and tile size is " + tileSize + " mi");
}

function getBoxesFromRoute(result) {
	var path = result.routes[0].overview_path;
	var boxes = routeBoxer.box(path, tileSize);
	tempBoxes = boxes; // for debug
	return boxes;
}

function getLatLongDictFromPt(pt_object) {
	return {'lat': pt_object.lat(), 'long': pt_object.lng()};
}

function formBoxesForYelp(boxes) {
	var yelpBoxes = [];
	for(var index in boxes) {
		box = boxes[index];
		var sw_pt = box.getSouthWest();
		var ne_pt = box.getNorthEast();
		var yelpBox = {'sw': getLatLongDictFromPt(sw_pt), 'ne': getLatLongDictFromPt(ne_pt)};
		yelpBoxes.push(yelpBox);
	}
	return yelpBoxes;
}

function addBizMarkerToMap(biz) {
	//console.log(coords);
	var coords = {'lat': biz.location.coordinate.latitude, 'lng': biz.location.coordinate.longitude};
	var marker_location = new google.maps.LatLng(coords.lat, coords.lng);
	//console.log(marker_location);
	var marker = new google.maps.Marker({
		position: marker_location,
		map: map,
		icon: yelpMapIcon,
		draggable: false,
		animation: google.maps.Animation.DROP
	});
	currentMarkerInstances.push(marker);

	// Click event
	/*
	google.maps.event.addListener(marker, 'click', function(){
		//console.log(this);
        if (this.getAnimation() !== null) {
            this.setAnimation(null);
        }
        else {
            this.setAnimation(google.maps.Animation.BOUNCE);
        }
	});
	*/

	//// Info Window
	var markerInfoWindow = new google.maps.InfoWindow({
    	content: " " +
"<table><tbody><tr><td>" +
"<img style='width:50px; height:50px;' src='" + biz.image_url + "'>" +
"</td><td style='padding-left: 5px;'>" +
"<a href='" + biz.url + "'>" +
biz.name +
"</a>" +
"<br>" +
"<img src='" + biz.rating_img_url + "'> " + biz.review_count + " reviews" +
"<br>" +
biz.display_phone +
"<br>" +
biz.location.address.join(' ') + ", " + biz.location.city + ", " + biz.location.state_code +
"</td></tr></tbody></table>"
	});

	google.maps.event.addListener(marker, 'click', function() {
		closeCurrentInfoWindow();
		currentlyOpenInfoWindow = markerInfoWindow;
		markerInfoWindow.open(map, marker);
	});
}

function closeCurrentInfoWindow() {
	if(currentlyOpenInfoWindow !== null) {
		currentlyOpenInfoWindow.close();
	}
}

function addBizToMap(biz) {
	addBizMarkerToMap(biz);
}

function formatResponseDataFromV2(data) {
	//console.log(data);
	for(var index in data.businesses) {
		var biz = data.businesses[index];
		//console.log(biz);
		addBizMarkerToMap(biz);
	}
}

function constructAndMakeRequest(terms, selectedCats, yelp_box) {
	parameters = [];
	//oldbounds = yelp_box.sw.lat + "," + yelp_box.sw.long + "|" + yelp_box.ne.lat + "," + yelp_box.ne.long;
	if(yelp_box.minlat === undefined) {
		return;
	}
	bounds = yelp_box.minlat + "," + yelp_box.minlong + "|" + yelp_box.maxlat + "," + yelp_box.maxlong;
	//"37.42919685420495,-122.65057023977272|38.14865413893994,-121.76934862753495"
	//near = "san+francisco"
	if(selectedCats.length > 0) {
		var category_param = selectedCats.join(",");
		//console.log(category_param);
		parameters.push(['category_filter', category_param]);
	}

	if(terms.length > 0) {
		parameters.push(['term', terms]);
	}
	// Will be the same for all requests
	parameters.push(['bounds', bounds]);
	//parameters.push(['near', near]);
	parameters.push(['callback', 'cb']);
	parameters.push(['oauth_consumer_key', yelp_auth.consumerKey]);
	parameters.push(['oauth_consumer_secret', yelp_auth.consumerSecret]);
	parameters.push(['oauth_token', yelp_auth.accessToken]);
	parameters.push(['oauth_signature_method', 'HMAC-SHA1']);
	var message = {
		'action': 'http://api.yelp.com/v2/search',
		'method': 'GET',
		'parameters': parameters
	};
	OAuth.setTimestampAndNonce(message);
	OAuth.SignatureMethod.sign(message, accessor);
	var parameterMap = OAuth.getParameterMap(message.parameters);
	parameterMap.oauth_signature = OAuth.percentEncode(parameterMap.oauth_signature);
	//console.log(parameterMap);

	$.ajax({
	  'url': message.action,
	  'data': parameterMap,
	  'cache': true,
	  'dataType': 'jsonp',
	  'jsonpCallback': 'cb',
	  'success': function(data, textStats, XMLHttpRequest) {
		//console.log(data);
		formatResponseDataFromV2(data);
	  },
	  'error': function(request, error) {
		console.log("Call failed: " + error);
	   }
	});
}

function getActiveCategories() {
	var active_elements = $("#category_filters > .active");
	return active_elements;
}

function getSelectedCategories() {
	active_elements = getActiveCategories();
	var categories = [];
	for(var index = 0; index < active_elements.length; index++) {
		var category = active_elements[index].getAttribute("data-category-id");
		categories.push(category);
	}
	return categories;
}

function performYelpSearch(yelp_boxes) {
	// Delete all previous markers
	for(var index in currentMarkerInstances) {
		currentMarkerInstances[index].setMap(null);
	}
	currentMarkerInstances = [];

	// Do search
	if(distanceToDest > 600 || yelp_boxes.length > 25) {
		$("#alert_message").html(" That route is too long.");
		$("#alert_button").show();
		console.log("Too many boxes. Skipping search.");
		return;
	}

	var selectedCat = getSelectedCategories();
	var term = $("#search_term").val();

	for(var index_new in yelp_boxes) {
		var time_out = 900*index_new;
		//console.log(time_out);
		setTimeout(constructAndMakeRequest, time_out, term, selectedCat, yelp_boxes[index_new]);

		//return;
		//alert('Call: ' + index);
	}
}

function formPointsForYelp(result) {
        var points = []; //new Array();
        for (var leg in result.routes[0].legs) {
                for (var step in result.routes[0].legs[leg].steps) {
                        segment_points = decodeLine(result.routes[0].legs[leg].steps[step].polyline.points);
                        points = points.concat(segment_points);
                }
        }
        return points;
}

function trim_boxes(boxes, route_points) {
        for (var i = 0; i<route_points.length; i++) {
                pt = route_points[i];
                var j = 0;
                for (j = 0; j<boxes.length; j++) {
                        if (pointIsInYelpBox(boxes[j], pt))
                                break;
                }

                if (boxes[j]['maxlat']) {
                        if (pt[0] > boxes[j].maxlat)
                                boxes[j].maxlat = pt[0];
                } else
                        boxes[j]['maxlat'] = pt[0];

                if (boxes[j]['maxlong']) {
                        if (pt[1] > boxes[j].maxlong)
                                boxes[j].maxlong = pt[1];
                } else
                        boxes[j]['maxlong'] = pt[1];

                if (boxes[j]['minlat']) {
                        if (pt[0] < boxes[j].minlat)
                                boxes[j].minlat = pt[0];
                } else
                        boxes[j]['minlat'] = pt[0];

                if (boxes[j]['minlong']) {
                        if (pt[1] < boxes[j].minlong)
                                boxes[j].minlong = pt[1];
                } else
                        boxes[j]['minlong'] = pt[1];
        }
        return boxes;
}

function decode () {
  var instring;
  var outstring;
  var points;

  instring = document.getElementById("polylineDecoder").encodedPolylineIn.value;
  instring = instring.replace(/\\\\/g, "\\");
  points = decodeLine(instring);
  outstring = "";
  for(i=0; i < points.length; i++) {
    outstring = outstring + points[i][0] + ", " + points[i][1] + "\n";
  }
  document.getElementById("polylineDecoder").decodedPolylineOut.value = outstring;
}

// This function is from Google's polyline utility.
function decodeLine (encoded) {
  var len = encoded.length;
  var index = 0;
  var array = [];
  var lat = 0;
  var lng = 0;

  while (index < len) {
    var b;
    var shift = 0;
    var result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    array.push([lat * 1e-5, lng * 1e-5]);
  }

  return array;
}

function pointIsInYelpBox(box, point) {
        return (point[0] < box.ne.lat && point[0] > box.sw.lat && pt[1] < box.ne.long && point[1] > box.sw.long);
}

function drawTightBoxes(boxes) {
  //boxpolys = new Array(boxes.length);
  boxpolys = [];
  for (var i = 0; i < boxes.length; i++) {
        minLatLng = new google.maps.LatLng(boxes[i].minlat, boxes[i].minlong);
        maxLatLng = new google.maps.LatLng(boxes[i].maxlat, boxes[i].maxlong);
        boundsLatLng = new google.maps.LatLngBounds(minLatLng, maxLatLng);
        boxpolys[i] = new google.maps.Rectangle({
          bounds: boundsLatLng,
          fillOpacity: 0,
          strokeOpacity: 1.0,
          strokeColor: '#000000',
          strokeWeight: 1,
          map: map
        });
  }
}

function updateWithDirections(result) {
	// Update vars from the route results
	updateUsingRouteResult(result);
	// Display the route in the map
	directionsRenderer.setDirections(result);
	// Form boxes from the route
	boxes = getBoxesFromRoute(result);
	route_points = formPointsForYelp(result);
	console.log('Number of boxes: ' + boxes.length);
	//drawBoxes(boxes);
	yelp_boxes = formBoxesForYelp(boxes);
	yelp_boxes = trim_boxes(yelp_boxes, route_points);
	console.log('Number of trimmed boxes: ' + yelp_boxes.length);
	//drawTightBoxes(yelp_boxes);
	//alert(yelp_boxes);
	performYelpSearch(yelp_boxes);
}

function searchOMW() {
	// Init the params
	var start_location = $("#start_location").val();
	var dest_location = $("#dest_location").val();
	var request = {
		origin: start_location,
		destination: dest_location,
		travelMode: google.maps.DirectionsTravelMode.DRIVING
	};

	// Make the request
	directionService.route(request, function(result, status) {
		if(status == google.maps.DirectionsStatus.OK) {
			updateWithDirections(result);
		}else{
			console.log("Directions query failed: " + status);
		}
	});
}


// Debug
// Draw the array of boxes as polylines on the map
function drawBoxes(boxes) {
  //boxpolys = new Array(boxes.length);
  boxpolys = [];
  for (var i = 0; i < boxes.length; i++) {
	boxpolys[i] = new google.maps.Rectangle({
	  bounds: boxes[i],
	  fillOpacity: 0,
	  strokeOpacity: 1.0,
	  strokeColor: '#000000',
	  strokeWeight: 1,
	  map: map
	});
  }
}

// Init functions

$(document).ready(function() {
	initialize();
	setupDirectionsRouter(map);
});
