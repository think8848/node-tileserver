/*
Copyright (c) 2011-2013, Darafei Praliaskouski, Vladimir Agafonkin, Maksim Gurtovenko
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/


Kothic.path = (function () {
	var dashPattern;

	function setDashPattern(point, dashes) {
		dashPattern = {
			pattern: dashes,
			seg: 0,
			phs: 0,
			x: point[0],
			y: point[1]
		};
	}

	function dashTo(ctx, point) {
		var pt = dashPattern,
			dx = point[0] - pt.x,
			dy = point[1] - pt.y,
			dist = Math.sqrt(dx * dx + dy * dy),
			x, more, t;

		ctx.save();
		ctx.translate(pt.x, pt.y);
		ctx.rotate(Math.atan2(dy, dx));
		ctx.moveTo(0, 0);

		x = 0;
		do {
			t = pt.pattern[pt.seg];
			x += t - pt.phs;
			more = x < dist;

			if (!more) {
				pt.phs = t - (x - dist);
				x = dist;
			}

			ctx[pt.seg % 2 ? 'moveTo' : 'lineTo'](x, 0);

			if (more) {
				pt.phs = 0;
				pt.seg = ++pt.seg % pt.pattern.length;
			}
		} while (more);

		pt.x = point[0];
		pt.y = point[1];

		ctx.restore();
	}

	// check if the point is on the tile boundary
	// returns bitmask of affected tile boundaries
	function isTileBoundary(p, size) {
		var r = 0;
		if (p[0] === 0)
			r |= 1;
		else if (p[0] === size)
			r |= 2;
		if (p[1] === 0)
			r |= 4;
		else if (p[1] === size)
			r |= 8;
		return r;
	}

	/* check if 2 points are both on the same tile boundary
	 *
	 * If points of the object are on the same tile boundary it is assumed
	 * that the object is cut here and would originally continue beyond the
	 * tile borders.
	 *
	 * This does not catch the case where the object is indeed exactly
	 * on the tile boundaries, but this case can't properly be detected here.
	 */
	function checkSameBoundary(p, q, size) {
		var bp = isTileBoundary(p, size);
		if (!bp)
			return 0;

		return (bp & isTileBoundary(q, size));
	}

	return function (ctx, feature, dashes, fill, ws, hs, granularity) {
		var type = feature.type,
			coords = feature.coordinates;

		if (type === "LineString") {
			coords = [coords];
			type = "MultiLineString";
		} else if (type === "Polygon") {
			coords = [coords];
			type = "MultiPolygon";
		}

		var i, j, k,
			points,
			len = coords.length,
			len2, pointsLen,
			prevPoint, point, screenPoint,
			dx, dy, dist;

		if (type === "MultiLineString") {
			var pad = 50, // how many pixels to draw out of the tile to avoid path edges when lines crosses tile borders
				skip = 2; // do not draw line segments shorter than this

			for (i = 0; i < len; i++) {
				points = coords[i];
				pointsLen = points.length;

				for (j = 0; j < pointsLen; j++) {
					point = points[j];

					// continue path off the tile by some abount to fix path edges between tiles
					if ((j === 0 || j === pointsLen - 1) && isTileBoundary(point, granularity)) {
						k = j;
						do {
							k = j ? k - 1 : k + 1;
							if (k < 0 || k >= pointsLen)
								break;
							prevPoint = points[k];

							dx = point[0] - prevPoint[0];
							dy = point[1] - prevPoint[1];
							dist = Math.sqrt(dx * dx + dy * dy);
						} while (dist <= skip);

						// all points are so close to each other that it doesn't make sense to
						// draw the line beyond the tile border, simply skip the entire line from
						// here
						if (k < 0 || k >= pointsLen)
							break;

						point[0] = point[0] + pad * dx / dist;
						point[1] = point[1] + pad * dy / dist;
					}
					screenPoint = Kothic.geom.transformPoint(point, ws, hs);

					if (j === 0) {
						ctx.moveTo(screenPoint[0], screenPoint[1]);
						setDashPattern(screenPoint, dashes);
					} else if (dashes) {
						dashTo(ctx, screenPoint);
					} else {
						ctx.lineTo(screenPoint[0], screenPoint[1]);
					}
				}
			}
		} else if (type === "MultiPolygon") {
			for (i = 0; i < len; i++) {
				for (k = 0, len2 = coords[i].length; k < len2; k++) {
					points = coords[i][k];
					pointsLen = points.length;
					prevPoint = points[0];

					for (j = 0; j <= pointsLen; j++) {
						point = points[j] || points[0];
						screenPoint = Kothic.geom.transformPoint(point, ws, hs);

						if (j === 0) {
							ctx.moveTo(screenPoint[0], screenPoint[1]);
							setDashPattern(screenPoint, dashes);
						} else if (!fill && checkSameBoundary(point, prevPoint, granularity)) {
							ctx.moveTo(screenPoint[0], screenPoint[1]);
							dashPattern.x = screenPoint[0];
							dashPattern.y = screenPoint[1];
						} else if (fill || !dashes) {
							ctx.lineTo(screenPoint[0], screenPoint[1]);
						} else {
							dashTo(ctx, screenPoint);
						}
						prevPoint = point;
					}
				}
			}
		}
	};
}());
