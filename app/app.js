
var fakeTmis =
[
	"Miles-in-Trail (MIT)",
	"Fix Balancing",
	"Airspace Flow Program",
	"Reroutes",
	"Traffic Management Advisor",
	"Ground Stop",
	"Ground Delay Program"
];


$(document).ready(function()
{
	d3.select(".dataset-dropwdown").selectAll("option")
		.data(datasetMetaInfo.datasets).enter().append("option")
		.attr("value", function(d,i)
		{
			return i;
		})
		.text(function(d)
		{
			return d.displayName;
		});


	updateUI();
	$("#datasetDropDown").change(function()
	{
		updateUI();

		// provide a way for the user to get back to the hand-selected features
		var dataset = datasetMetaInfo.datasets[$(this).val()];
		if(dataset.defaultFeatures) dataset.features = dataset.defaultFeatures;
	});

	$(".help-icon")
		.popover()
		.on("mouseover", function(){ $(this).parents(".column").siblings(".column").addClass("dimmed"); })
		.on("mouseout", function(){ $(this).parents(".column").siblings(".column").removeClass("dimmed"); })
	$("#pause").on("click", toggleWeatherMap.bind(null, false));
	$("#play").on("click", toggleWeatherMap.bind(null, true));

	$(window).resize(scaleUI);
});

function updateUI()
{
	var selectedDataset
		= datasetMetaInfo.rootDatasetPathPrefix +
			datasetMetaInfo.datasets[$("#datasetDropDown").val()].datasetPathPrefix +
			datasetMetaInfo.datasets[$("#datasetDropDown").val()].filename;

	d3.csv(selectedDataset, function(error, data)
	{
		// a way to hard code into each config item which feature columns to use from csv
		// pretty janky though, better to allow user to select desired set dynamically
		var restrictedToFeatures = datasetMetaInfo.datasets[$("#datasetDropDown").val()].features;

		updateFieldsetSelect(Object.keys(data[$("#datasetDropDown").val()]), restrictedToFeatures)

		if(restrictedToFeatures)
		{
			data = _.map(data, function(record)
			{
				return _.pick(record, function(value, key, object)
				{
						return _.union(['date', 'cluster'], restrictedToFeatures).indexOf(key) != -1;
				});
			});
		}

		var clusters = _.pluck(data, "cluster");
		var uniqueClusters = _.uniq(clusters);
		var colorMap = _.object(uniqueClusters, randomColors(uniqueClusters.length));

		updateCalendar(data, colorMap);
		updateClusterAveragesParallelCoordinates(data, colorMap);
		updateDayAveragesParallelCoordinates(data, colorMap);
		connectInteractions(data);

		setTimeout(scaleUI, 0); // scale the UI only once its final rendered width is known
	})

	
	d3.selectAll(".weather-controls").remove();
	drawWeatherControls();
}

function scaleUI()
{
	// Scaling the UI fixes the issue where smaller screen sizes had to do horizontal scrolling.
	var windowWidth = $(window).width();
	$("body").css("transform", "scale(1.0)");

	// 3000px is a "magic" value representing a large-enough width to surely fit the application UI
	// it's used to measure how big the UI /wants/ to be before scaling it dynamically based
	// on the actual viewport/window size.
	$("body").css("width", "3000px");

	var desiredWidth =
		_.map($(".column"), function(column)
		{
			return column.getBoundingClientRect().width + parseInt($(column).css("margin-left"))
		})
		.reduce(function(sum, width){ return sum + width }, 0);

	desiredWidth = Math.max(
		desiredWidth,
		Math.ceil(
			$("#help-right")[0].getBoundingClientRect().right +
			parseInt($(".left-column").css("margin-left"))
		)
	);

	if(windowWidth < Math.ceil(desiredWidth))
	{
		var scaleRatio = windowWidth / desiredWidth
		$("body").css("transform", "scale(" + scaleRatio + ")");
	}

	$("body").css("width", desiredWidth);
}

function updateFieldsetSelect(fields, defaultFeatures)
{
	//d3.selectAll(".fieldsetButton").classed("hidden", !defaultFeatures);
	var fieldsetSelect = d3.select("#fieldsetSelect")
		.html("")
		.selectAll("option")
		// all fields are selectable except `date` and `cluster`, which are automatically selected
		.data(fields.filter(function(key){ return ['date', 'cluster'].indexOf(key) === -1 }))
		.enter()
		.append("option")
		.attr("value", function(d){ return d; })
		.text(function(d){ return d; });

	if(defaultFeatures) fieldsetSelect.attr("selected", function(d){ return defaultFeatures.indexOf(d) !== -1 ? "selected" : null })
}

function connectInteractions(daysData)
{

	var dayDictionary =  _.reduce(daysData, function(reduction, item)
	{
		reduction[item.date] = item;
		return reduction;
	}, {});

	var emptyDayDataForClearingDayAveragesTable = _.reduce(daysData[0], function(reduction, value, key){ reduction[key] = "-"; return reduction; }, {});

	var clusterAveragesLines = d3.select(".cluster-averages-in-dataset")
		.selectAll(".foreground")
		.selectAll("path");

	var dayAveragesLines = d3.select(".day-averages-in-selected-cluster")
		.selectAll(".foreground")
		.selectAll("path");

	var calendars = d3.selectAll(".calendars");
	var days = calendars.selectAll(".day")

	var weatherMap = d3.selectAll(".weather-map");
	var selectedDateHeader = d3.selectAll(".selected-date-header");
	var dayAveragesBody = d3.select(".highlighted-day-averages tbody");
	var tmisBody = d3.select(".highlighted-day-tmis tbody");

	var nestedData =
		d3.nest()
			.key(function (d)
			{
				return d.date;
			})
			.rollup(function (d)
			{
				return d[0].cluster;
			})
			.map(daysData);


	function updateHighlightedTmis(tmiData)
	{
		tmisBody.html("");
		var tmisRows = tmisBody.selectAll("tr").data(tmiData).enter().append("tr");
		tmisRows.append("td").attr("class", "day-averages-label-cell").text(function(d){ return d;});
	}

	function updateHighlightedDayAveragesTable(dayData)
	{
		dayAveragesBody.html("");
		var dayAveragesRows = dayAveragesBody.selectAll("tr").data(_.pairs(_.omit(dayData, "date", "cluster"))).enter().append("tr");
		dayAveragesRows.append("td").attr("class", "day-averages-label-cell").text(function(d){ return d[0];});
		dayAveragesRows.append("td").attr("class", "day-averages-value-cell").text(function(d)
		{

			return _.isNaN(Number(d[1])) ? d[1] : Math.round(d[1] * 1000) / 1000;
		});
	}

	function updateHighlightedDaySection(date)
	{
		var momentObject = moment(date, "MM/DD/YYYY");

		selectedDateHeader.text(momentObject.format("MMM Do, YYYY"));

		var weatherMapfilename
			= datasetMetaInfo.rootWeatherMapPathPrefix +
				datasetMetaInfo.datasets[$("#datasetDropDown").val()].weatherMapPathPrefix +
				datasetMetaInfo.datasets[$("#datasetDropDown").val()].weatherMapNamePrefix +
				momentObject.format("YYYY") + "_" +
				momentObject.format("MM") + "_" +
				momentObject.format("DD") +
				".gif";

		toggleWeatherMap(false);
		weatherMap.selectAll("img,canvas,.jsgif").remove();
		weatherMap.insert("img", ":first-child").attr("src", weatherMapfilename);
		var curGIF = new SuperGif(
		{
				gif: weatherMap.select("img").node(),
				show_progress_bar: false,
				auto_play: true,
				draw_while_loading: true // looks a bit odd, but better than just waiting for it to load
		});

		curGIF.load(function() { drawWeatherControls.player = curGIF; toggleWeatherMap(true) });

		var dayData = dayDictionary[date];
		updateHighlightedDayAveragesTable(dayData);
	}

	function clearHighlightedDaySection()
	{
		toggleWeatherMap(false);
		weatherMap.selectAll("img,canvas,.jsgif").remove();
		weatherMap.insert("img", ":first-child").attr("src", datasetMetaInfo.noDaySelectedWeatherMapImage);
		selectedDateHeader.text("no day selected...");
		updateHighlightedDayAveragesTable(emptyDayDataForClearingDayAveragesTable);
	}

	updateHighlightedDayAveragesTable(emptyDayDataForClearingDayAveragesTable);
	updateHighlightedTmis(["-", "-"]);

	clusterAveragesLines
		.on("mouseover", function(hoveredLineData)
		{
			clusterAveragesLines.filter(function(nonHoveredLineData)
			{
				return hoveredLineData != nonHoveredLineData;
			}).attr("opacity", "0");

			dayAveragesLines.filter(function(dayAveragesLineData)
			{
				return hoveredLineData.cluster != dayAveragesLineData.cluster;
			}).attr("opacity", "0");

			days.attr("opacity",".2");
			calendars.selectAll("rect.cluster-"+ hoveredLineData.cluster).attr("opacity","1");
		})
		.on("mouseout", function(hoveredLineData)
		{
			clusterAveragesLines.attr("opacity", "1");
			dayAveragesLines.attr("opacity", "1");
			calendars.selectAll("rect.day").attr("opacity", "1");
		});

	dayAveragesLines
		.on("mouseover", function(hoveredLineData)
		{
			dayAveragesLines.filter(function(nonHoveredLineData)
			{
				return hoveredLineData.cluster != nonHoveredLineData.cluster;
			}).attr("opacity", "0");

			dayAveragesLines.filter(function(nonHoveredLineData)
			{
				return hoveredLineData.cluster == nonHoveredLineData.cluster && hoveredLineData != nonHoveredLineData;
			}).attr("opacity", ".01");

			clusterAveragesLines.filter(function(clusterAveragesLineData)
			{
				return hoveredLineData.cluster != clusterAveragesLineData.cluster;
			}).attr("opacity", ".1");

			days.attr("opacity",".2");
			calendars.selectAll("rect.cluster-"+ hoveredLineData.cluster).attr("opacity","1");

			//calendars.selectAll("rect.cluster-"+ hoveredLineData.cluster).attr("opacity",function(date)
			//{
			//	var opacity = hoveredLineData.date == date ? 1 : .2;
			//	return opacity;
			//});

			updateHighlightedDaySection(hoveredLineData.date);
			updateHighlightedTmis(_.sample(fakeTmis, _.random(2, 2)));
		})
		.on("mouseout", function(hoveredLineData)
		{
			dayAveragesLines.attr("opacity", "1");
			clusterAveragesLines.attr("opacity", "1");
			calendars.selectAll("rect.day").attr("opacity", "1");
			clearHighlightedDaySection();
			updateHighlightedTmis(["-", "-"]);
		});

	days
		.on("mouseover", function(date)
		{
			days.filter(function(e)
			{
				return nestedData[date] != nestedData[e];
			}).attr("opacity", ".25");

			clusterAveragesLines.filter(function(e)
			{
				return nestedData[date] != e.cluster;
			}).attr("opacity", "0");

			dayAveragesLines.filter(function(e)
			{
				return nestedData[date] != e.cluster;
			}).attr("opacity", "0");

			dayAveragesLines.filter(function(e)
			{
				return nestedData[date] == e.cluster;
			}).attr("opacity", ".01");

			dayAveragesLines.filter(function(e)
			{
				return date == e.date;
			}).attr("opacity", "1");

			updateHighlightedDaySection(date);
			updateHighlightedTmis(_.sample(fakeTmis, _.random(2, 2)));
		})
		.on("mouseout", function(d)
		{
			days.attr("opacity", "1");
			clusterAveragesLines.attr("opacity", "1");
			dayAveragesLines.attr("opacity", "1");
			clearHighlightedDaySection();
			updateHighlightedTmis(["-", "-"]);
		})
		.on("click", function(date){
			// Clicking on a particular day freezes the normal mouse behavior,
			// and instead locks the calendar UI to save the Highlighted Day information.
			// Clicking on a day aside from the selected day clears the selection.

			var dayEventHandlers = ["mouseover", "mouseout", "click"];
			var preservedHandlers = {};

			// remove the old handlers but store references to them so they can be reinstated
			_.forEach(dayEventHandlers, function(handlerName)
			{
				preservedHandlers[handlerName] = days.on(handlerName);
				days.on(handlerName, null);
			})

			// apply a new style just to the visually-important `selected-day`.
			d3.select(this).classed("selected-day", true);

			// de-emphasize all of the rest of the days
			d3.selectAll(".day:not(.selected-day)").attr("opacity", 0.25);

			// this code makes the other days clickable to deselect the selected day
			// and add the handlers back
			days.on("click", undoSelectDay);
			d3.select(".left-column").on("mouseover", undoSelectDay);

			function undoSelectDay()
			{
				// this handler removes itself immediately because it's just needed once as a toggle
				days.on("click", null);
				d3.select(".left-column").on("mouseover", null);

				// reinstate all of the temporarily-disabled functionality
				_.forEach(dayEventHandlers, function(handlerName)
				{
					days.on(handlerName, preservedHandlers[handlerName]);
				})

				// un-highlight the selected day
				d3.selectAll(".selected-day").classed("selected-day", false);

				// restore all of the opacities and such in the calendar, using the logic
				// of the normal mouseout handler
				preservedHandlers.mouseout();
			}
		});

	d3.select(".fieldsetSelectConfirmBtn")
		.on("click", function displaySelectedFieldset()
		{
			var dataset = datasetMetaInfo.datasets[$("#datasetDropDown").val()];

			// preserve the hand-selected default features in case we want to reverse to the default later
			if(!dataset.defaultFeatures) dataset.defaultFeatures = dataset.features;

			dataset.features = $("#fieldsetSelect").val();
			updateUI();
		});
}

function drawWeatherControls()
{
	// the gutter is the left-hand side white area hard-rendered into the GIFs.
	var gutter = 10;

	// values for consistent spacing/padding
	var pad = {
		x: 25,
		y: 10
	};

	// the weather GIFs have a hard-rendered white border. this path hides them with the body bgcolor
	var dataCleanUpPath = {
		path: "M-3 0 L-3 250 L306 250 L306 0 Z",
		color: "#eee" // should match with body bg
	};

	// a top-only stylistic feature to make this seem more like a true video player
	// (the bottom scrub area serves as the lower visual cue)
	var letterbox = {
		width: 279,
		height: 20,
		x: 2 + gutter,
		y: 0,
		radius: 7,
		color: "rgb(41, 63, 79)"
	};

	var scrubBar =  {
		x: 2 + gutter,
		y: 210,
		width: 279,
		height: 40,
		color: "rgb(41, 63, 79)",
		radius: 7
	};

	// play/pause toggle button
	var play = {
		x: 15 + gutter,
		y: scrubBar.y + scrubBar.height - 10 + 1,
		height: 25,
		width: 20,
		color: "rgb(73, 197, 157)"
	};

	var pause = {
		x: 15 + gutter,
		y: scrubBar.y + scrubBar.height - 15 + 1,
		height: 25,
		width: 20,
		color: "rgb(73, 197, 157)"
	};

	// the track
	var scrubber = {
		x: pad.x + play.x + play.width,
		y: scrubBar.y + scrubBar.height / 2,
		height: 14,
		width: 150,
		color: "rgb(204, 210, 216)"
	};

	// the thing moving on the track
	var scrubbee = {
		radius: 10,
		color: "rgb(73, 197, 157)"
	};

	var time = {
		x: scrubber.x + scrubber.width + pad.x,
		y: scrubBar.y + scrubBar.height / 2 + 4,
		color: scrubber.color,
		text: "12am"
	};

	weatherControls = d3.select('.highlighted-day-section').append("svg");
	weatherControls
		.attr("class", "weather-controls")
		.attr("shape-rendering", "geometricPrecision");

	// this code is run when we want to re-render the whole thing, so get rid of the last one.
	weatherControls
		.html("");

	// cleanup GIF edges
	weatherControls
		.append("path")
		.attr("d", dataCleanUpPath.path)
		.attr("stroke", dataCleanUpPath.color)
		.attr("fill", "rgba(0, 0, 0, 0)")
		.attr("stroke-linecap", "square")
		.attr("stroke-width", 30);

	// letterbox
	weatherControls
		.append("path")
		.attr("d", partiallyRoundedRect(letterbox.x, letterbox.y, letterbox.width, letterbox.height, letterbox.radius, true, true, false, false))
		.attr("fill", letterbox.color);

	// scrubBar
	weatherControls
		.append("path")
		.attr("d", partiallyRoundedRect(scrubBar.x, scrubBar.y, scrubBar.width, scrubBar.height, scrubBar.radius, false, false, true, true))
		.attr("fill", scrubBar.color);

	// scrubber
	weatherControls
		.append("line")
		.attr("class", "scrubber")
		.attr("x1", scrubber.x)
		.attr("y1", scrubber.y)
		.attr("x2", scrubber.x + scrubber.width)
		.attr("y2", scrubber.y)
		.attr("stroke-linecap", "round")
		.attr("stroke-width", scrubber.height)
		.attr("stroke", scrubber.color);

	// scrubbee
	weatherControls
		.append("circle")
		.attr("class", "scrubbee")
		.attr("cx", scrubber.x)
		.attr("cy", scrubber.y)
		.attr("r", scrubbee.radius)
		.attr("fill", scrubbee.color);

	// play button
	weatherControls
		.append("text")
		.attr("id", "play")
		.attr("class", "play play-pause hidden")
		.attr("fill", play.color)
		.attr("x", play.x)
		.attr("y", play.y)
		.text("▶");

	// pause button. different element due to how wildly different the two symbols render and position themselves.
	weatherControls
		.append("text")
		.attr("id", "pause")
		.attr("class", "pause play-pause")
		.attr("fill", pause.color)
		.attr("x", pause.x)
		.attr("y", pause.y)
		.text("▌▌");

	weatherControls
		.append("text")
		.attr("class", "weather-time")
		.attr("fill", time.color)
		.attr("x", time.x)
		.attr("y", time.y)
		.text(time.text);



	// set up event handling for the controls.
	var $scrubbee = $(".scrubbee");
	var $scrubber = $(".scrubber");
	var page = $("body");
	$scrubbee
		.on("mousedown", function()
		{
			var pageMouseMove = function(e)
			{
				var mouseX = e.clientX
				var scrubberX = $scrubber[0].getBoundingClientRect().left
				var position = Math.min(Math.max(scrubberX, mouseX), scrubberX + scrubber.width);

				// actually more of a ratio than a percent, but it's 0 ... 1
				var percent = (position - scrubberX) / scrubber.width
				$scrubbee.attr("cx", scrubber.x + percent * scrubber.width)
				var player = drawWeatherControls.player
				player.move_to(0 | ((percent == 1 ? percent - 0.01 : percent) * player.get_length()))
				updateWeatherTime();
			};
			var pageMouseUp = function()
			{
				page
					.off("mouseup", pageMouseUp)
					.off("mousemove", pageMouseMove);

				$(document).off("mouseout");
			};

			page
				.on("mousemove", pageMouseMove)
				.on("mouseup", pageMouseUp);

			$(document).on("mouseout", function(e)
			{
				e.relatedTarget && e.relatedTarget.nodeName == "HTML" ? pageMouseUp(e) : null;
			})
		});



	function partiallyRoundedRect(x, y, width, height, radius, tlRounded, trRounded, blRounded, brRounded)
	{
		var path = "";
		path  = "M" + (x + radius) + "," + y;
		path += "h" + (width - 2*radius);
		if (trRounded){ path += "a" + radius + "," + radius + " 0 0 1 " + radius + "," + radius; }
		else { path += "h" + radius; path += "v" + radius; }
		path += "v" + (height - 2*radius);
		if (brRounded) { path += "a" + radius + "," + radius + " 0 0 1 " + -radius + "," + radius; }
		else { path += "v" + radius; path += "h" + -radius; }
		path += "h" + (2*radius - width);
		if (blRounded) { path += "a" + radius + "," + radius + " 0 0 1 " + -radius + "," + -radius; }
		else { path += "h" + -radius; path += "v" + -radius; }
		path += "v" + (2*radius - height);
		if (tlRounded) { path += "a" + radius + "," + radius + " 0 0 1 " + radius + "," + -radius; }
		else { path += "v" + -radius; path += "h" + radius; }
		path += "z";
		return path;
	}
}

function updateWeatherTime()
{
	var timeText = d3.selectAll(".weather-time");
	var player = drawWeatherControls.player;

	// probably overwrought logic for what could just be ["12am"... 23][hourTime]
	var percentTime = player.get_current_frame() / player.get_length();
	if(percentTime < 0) percentTime = 0;
	var hourTime = Math.round(percentTime * 24);
	var ampm;
	switch(hourTime){
		case 0:
		case 24:
			ampm = "am";
			break;
		case 12:
			ampm = "pm";
			break;
		default:
			if(hourTime > 12) ampm = "pm";
			if(hourTime < 12) ampm = "am";
	}

	if(hourTime == 0) hourTime = 12;
	if(hourTime > 12) hourTime -= 12;
	timeText.text(hourTime + ampm);
}

// play=false implies you want to pause
function toggleWeatherMap(play){
	cancelAnimationFrame(toggleWeatherMap.animationID);
	if(play){
		d3.select("#play").classed("hidden", true);
		d3.select("#pause").classed("hidden", false);
		drawWeatherControls.player && drawWeatherControls.player.play();

		toggleWeatherMap.animationID = requestAnimationFrame(function play()
		{
			var player = drawWeatherControls.player
			updateWeatherTime();
			var percent = player.get_current_frame() / player.get_length();
			if(percent < 0) percent = 0;
			if($('.weather-map img').length){ // odd condition where animation is still occurring when there's no GIF canvas
				cancelAnimationFrame(toggleWeatherMap.animationID);
				percent = 0;
			}
			var width = $(".scrubber")[0].getBoundingClientRect().width;
			var position = parseFloat($(".scrubber").attr("x1")) + percent * (width + width * (1 / player.get_length()));
			if(isNaN(position) || position == -Infinity || position == Infinity) position = parseFloat($(".scrubber").attr("x1"));
			$(".scrubbee").attr("cx", position);

			toggleWeatherMap.animationID = requestAnimationFrame(play);
		})
	} else {
		drawWeatherControls.player && drawWeatherControls.player.pause();
		d3.select("#play").classed("hidden", false);
		d3.select("#pause").classed("hidden", true);
		cancelAnimationFrame(toggleWeatherMap.animationID);
	}

}

function updateCalendar(dayData, colorMap)
{
	var cellSize = 15;
	var paddingSize = 10;
	var height = 960;
	var verticalOffset = 30;
	var width = cellSize * 7 + (paddingSize * 2);

	var day = d3.time.format("%w");
	var week = d3.time.format("%U");
	var percent = d3.format(".1%");
	//var format = d3.time.format("%Y-%m-%d");
	var format = d3.time.format("%m/%d/%Y");

	d3.select(".calendars").html("");
	d3.select(".calendar-legend-entries").html("");

	var calendars =
		d3.select(".calendars")
			.selectAll("empty")
			.data(d3.range(2013, 2016))
			.enter().append("div")
			.attr("class", "calendar")
			.attr("width", width)
			.append("svg")
			.attr("width", width)
			.attr("height", height)
			.attr("class", "RdYlGn")
			.append("g")
			.attr("transform", "translate(" + paddingSize + "," + verticalOffset +")");

	calendars.append("text")
		.attr("transform", "translate(" + width/2 + "," + -10 + ")")
		.attr("class", "year-header")
		.text(function(d) { return d; });

	var days =
		calendars.selectAll(".day")
			.data(function (d)
			{
				return d3.time.days(new Date(d, 0, 1), new Date(d + 1, 0, 1));
			})
			.enter().append("rect")

			.attr("width", cellSize)
			.attr("height", cellSize)
			.attr("y", function (d)
			{
				return week(d) * cellSize;
			})
			.attr("x", function (d)
			{
				return day(d) * cellSize;
			})
			.datum(format);

	days.append("title")
		.text(function (d)
		{
			return d;
		});

	calendars.selectAll(".month")
		.data(function (d)
		{
			return d3.time.months(new Date(d, 0, 1), new Date(d + 1, 0, 1));
		})
		.enter().append("path")
		.attr("class", "month")
		.attr("d", monthPath);

	var nestedData =
		d3.nest()
			.key(function (d)
			{
				return d.date;
			})
			.rollup(function (d)
			{
				return d[0].cluster;
			})
			.map(dayData);

		days.filter(function (d)
		{
			return d in nestedData;
		})
		.attr("style", function (d)
		{
			var color = colorMap[nestedData[d]];
			return "fill: rgb(" + color[0] + "," + color[1] + "," + color[2] + ")";
		})
		.attr("class", function (d)
		{
			return "day cluster-" + nestedData[d];
		})
		.select("title")
		.text(function (d)
		{
			return d + ": Cluster " + nestedData[d];
		});

	if(dayData.length < 1461)
	{
		colorMap["No Data"] = [200,200,200];
	}

	var legendEntries =
			d3.select(".calendar-legend-entries")
				.selectAll("div")
				.data(Object.keys(colorMap))
				.enter()
				.append("div")
				.attr("class", function(d)
				{
					return "calendar-legend-entry label-cluster-" + d;
				});

	legendEntries
		.append("div")
		.attr("class", "calendar-legend-entry-color-box")
		.style("background-color", function(d)
		{
			var color = colorMap[d];
			return "rgb(" + color[0] + "," + color[1] + "," + color[2] + ")";
		});

	legendEntries
		.append("span")
		.attr("class", "calendar-legend-entry-color-label")
		.text(function(d)
		{
			if(d == "No Data")
				return d;
			else
				return "Cluster " + d;
		});


	// this code hooks into the same mouseover/mouseout handlers that are on the cluster average lines.
	legendEntries
		.on("mouseover", function(cluster)
		{
			var clusterAveragesLines = d3.select(".cluster-averages-in-dataset")
				.selectAll(".foreground")
				.selectAll("path");

			clusterAveragesLines.on("mouseover").call(clusterAveragesLines[cluster - 1], clusterAveragesLines.data()[cluster - 1]);
		})
		.on("mouseout", function()
		{
			d3.select(".cluster-averages-in-dataset")
				.selectAll(".foreground")
				.selectAll("path").on("mouseout")();
		});

	function monthPath(t0) {
		var t1 = new Date(t0.getFullYear(), t0.getMonth() + 1, 0),
			d0 = +day(t0),
			w0 = +week(t0),
			d1 = +day(t1),
			w1 = +week(t1);
		return "M" + d0 * cellSize + "," + (w0) * cellSize + "H" + 7 * cellSize + "V" + (w1) * cellSize + "H" + (d1 + 1) * cellSize + "V" + (w1 + 1) * cellSize + "H" + 0 + "V" + (w0 + 1) * cellSize + "H" + d0 * cellSize + "Z";
	}

}

function updateClusterAveragesParallelCoordinates(data, colorMap)
{
	var rolledUpClusterAverages =
			d3.nest()
				.key(function(d){ return d.cluster; })

				.rollup(function(d)
				{
					var retval = {};
					Object.keys(d[0]).forEach(function(columnName)
					{
						if(columnName != "date" && columnName != "cluster")
							retval[columnName] = d3.mean(d, function(f) { return f[columnName]; })
					});
					retval.cluster = d[0].cluster;
					return retval;
				})
				.map(data)
		;

	var valuesOfRolledUpClusterAverages =  d3.values(rolledUpClusterAverages);
	createParallelCoordinatesPlot(d3.values(valuesOfRolledUpClusterAverages), ".cluster-averages-in-dataset", colorMap, "cluster-averages");
}

function updateDayAveragesParallelCoordinates(data, colorMap)
{
	createParallelCoordinatesPlot(data, ".day-averages-in-selected-cluster", colorMap, "day-averages");
}

function createParallelCoordinatesPlot(clusterData, elementSelector, colorMap, className)
{
	var margin = {top: 30, right: 10, bottom: 10, left: 10},
		width = 600 - margin.left - margin.right,
		height = 300 - margin.top - margin.bottom;

	var x = d3.scale.ordinal().rangePoints([0, width], 1),
		y = {},
		dragging = {};

	var line = d3.svg.line(),
		axis = d3.svg.axis().orient("left"),
		background,
		foreground;

	d3.select(elementSelector).html("");

	var svg = d3.select(elementSelector).append("svg")
		.attr("width", width + margin.left + margin.right)
		.attr("height", height + margin.top + margin.bottom)
		.append("g")
		.attr("transform", "translate(" + margin.left + "," + margin.top + ")");


	// Extract the list of dimensions and create a scale for each.
	x.domain(dimensions = d3.keys(clusterData[0]).filter(function(d) {
		return d != "date" && d != "cluster" && (y[d] = d3.scale.linear()
				.domain(d3.extent(clusterData, function(p) { return +p[d]; }))
				.range([height, 0]));
	}));

	// Add grey background lines for context.
	background = svg.append("g")
		.attr("class", "background")
		.selectAll("path")
		.data(clusterData)
		.enter().append("path")
		.attr("d", path);

	// Add blue foreground lines for focus.
	foreground = svg.append("g")
		.attr("class", "foreground")
		.selectAll("path")
		.data(clusterData)
		.enter().append("path")
		.attr("d", path)
		.attr("class", function(d)
		{
			return className + " cluster-" + d.cluster;
		})
		.attr("stroke", function(d)
		{
			var color = colorMap[d.cluster];
			return "rgb(" + color[0] + "," + color[1] + "," + color[2] + ")";
		})
	;

	// Add a group element for each dimension.
	var g = svg.selectAll(".dimension")
		.data(dimensions)
		.enter().append("g")
		.attr("class", "dimension")
		.attr("transform", function(d) { return "translate(" + x(d) + ")"; })
		.call(d3.behavior.drag()
			.origin(function(d) { return {x: x(d)}; })
			.on("dragstart", function(d) {
				dragging[d] = x(d);
				background.attr("visibility", "hidden");
			})
			.on("drag", function(d) {
				dragging[d] = Math.min(width, Math.max(0, d3.event.x));
				foreground.attr("d", path);
				dimensions.sort(function(a, b) { return position(a) - position(b); });
				x.domain(dimensions);
				g.attr("transform", function(d) { return "translate(" + position(d) + ")"; })
			})
			.on("dragend", function(d) {
				delete dragging[d];
				transition(d3.select(this)).attr("transform", "translate(" + x(d) + ")");
				transition(foreground).attr("d", path);
				background
					.attr("d", path)
					.transition()
					.delay(500)
					.duration(0)
					.attr("visibility", null);
			}));

	// Add an axis and title.
	g.append("g")
		.attr("class", "axis")
		.each(function(d) { d3.select(this).call(axis.scale(y[d])); })
		.append("text")
		.style("text-anchor", "middle")
		.attr("y", -9)
		.text(function(d) { return d; });

	// Add and store a brush for each axis.
	g.append("g")
		.attr("class", "brush")
		.each(function(d) {
			d3.select(this).call(y[d].brush = d3.svg.brush().y(y[d]).on("brushstart", brushstart).on("brush", brush));
		})
		.selectAll("rect")
		.attr("x", -8)
		.attr("width", 16);


	function position(d)
	{
		var v = dragging[d];
		return v == null ? x(d) : v;
	}

	function transition(g)
	{
		return g.transition().duration(500);
	}

	// Returns the path for a given data point.
	function path(d)
	{
		return line(dimensions
			.map(function(p) { return [position(p), y[p](d[p])]; })
			// remove points which have no available data point for this field
			.filter(function(p) { return !isNaN(p[1]); })
		);
	}

	function brushstart()
	{
		d3.event.sourceEvent.stopPropagation();
	}

	// Handles a brush event, toggling the display of foreground lines.
	function brush()
	{
		var actives = dimensions.filter(function(p) { return !y[p].brush.empty(); }),
			extents = actives.map(function(p) { return y[p].brush.extent(); });
		foreground.style("display", function(d) {
			return actives.every(function(p, i) {
				return extents[i][0] <= d[p] && d[p] <= extents[i][1];
			}) ? null : "none";
		});
	}

}
