"use strict";

var EARTH_RADIUS_M = 6371000.0;

// dem.js의 DEM 데이터를 실제 고도값으로 변환
function unpackDEM()
{
    var binary = atob(DEM.packed);
    var bytes = Uint8Array.from(binary, function(c) { return c.charCodeAt(0); });
    var view = new DataView(bytes.buffer);
    var metres = new Float32Array(DEM.rows * DEM.cols);

    // 2바이트 정수형 고도 데이터를 미터 단위로 변환
    for (var i = 0; i < metres.length; i++)
    {
        metres[i] = view.getInt16(i * 2, true) * DEM.metresPerUnit;
    }

    return metres;
}

// 위도와 경도를 이용하여 DEM에서 해당 위치의 고도 추출
function getElevationFromDEM(metres, lat, lon)
{
    var r = Math.round((90.0 - lat) / DEM.step);            // 위도
    var c = Math.round((lon + 180.0) / DEM.step);           // 경도

    // 데이터 범위를 벗어나지 않도록 행과 열 제한
    r = Math.max(0, Math.min(DEM.rows - 1, r));
    c = ((c % DEM.cols) + DEM.cols) % DEM.cols;

    return metres[r * DEM.cols + c];
}

// 고도에 따라 지형 색상 지정
function elevationColor(h)                 // 높낮이를 색상으로 구분
{
    if (h < -2000.0)
        return [0.10, 0.25, 0.55, 1.0];    // 깊은 바다
    if (h < 0.0)
        return [0.20, 0.48, 0.80, 1.0];    // 얕은 바다
    if (h < 1000.0)
        return [0.25, 0.65, 0.30, 1.0];    // 낮은 지대
    if (h < 2800.0)
        return [0.65, 0.50, 0.30, 1.0];    // 높은 지대
    return [0.95, 0.95, 0.95, 1.0];        // 고산 지대
}

// 위도와 경도를 이용하여 지구 메시 생성
function buildEarthMesh(metres, latSeg, lonSeg)
{
    var radial = [];                        // 방향
    var heights = [];                       // 고도
    var vertexColors = [];                  // 색상
    var indices = [];                       // 삼각형을 구성하는 정점

    // 위도와 경도에 따라 정점 좌표, 고도, 색상 생성
    for (var i = 0; i <= latSeg; i++)
    {
        var lat = -90.0 + (i / latSeg) * 180.0;
        var phi = radians(lat);

        for (var j = 0; j <= lonSeg; j++)
        {
            var lon = -180.0 + (j / lonSeg) * 360.0;
            var theta = radians(lon);
            var h = getElevationFromDEM(metres, lat, lon);          // 해당 위치의 고도 추출

            // 위도와 경도를 구면 좌표계의 3차원 좌표로 변환
            var x = Math.cos(phi) * Math.sin(theta);
            var y = Math.sin(phi);
            var z = Math.cos(phi) * Math.cos(theta);

            radial.push([x, y, z]);                 // 각 정보 저장
            heights.push(h);
            vertexColors.push(elevationColor(h));
        }
    }

    var stride = lonSeg + 1;

    // 인접한 네 정점을 삼각형 2개로 메시 구성
    for (var i = 0; i < latSeg; i++)
    {
        for (var j = 0; j < lonSeg; j++)         // 2개의 삼각형을 구성하는 네 정점 계산
        {
            var a = i * stride + j;
            var b = a + 1;
            var c = (i + 1) * stride + j;
            var d = c + 1;

            indices.push(a, b, c);              // 삼각형 2개로 분할
            indices.push(b, d, c);
        }
    }

    // 지형 계산에 필요한 데이터 반환
    return {
        radial: radial,
        heights: heights,
        vertexColors: vertexColors,
        indices: indices,
        points: null,
        normals: null,
        colors: null
    };
}

// 고도 정보를 반영하여 지형 정점 좌표와 법선 벡터 계산
function updateTerrainGeometry(mesh, scale)
{
    var p = [];
    var n = [];
    var idx = mesh.indices;

    // 고도 배율을 적용하여 좌표 계산
    for (var i = 0; i < mesh.radial.length; i++)
    {
        var radius = 1.0 + (scale * mesh.heights[i]) / EARTH_RADIUS_M;          // 지구 반지름

        p.push([                            // 정점의 각 방향에 반지름을 곱하여 좌표 생성
            radius * mesh.radial[i][0],
            radius * mesh.radial[i][1],
            radius * mesh.radial[i][2]
        ]);

        // 각 정점의 법선 벡터 초기화
        n.push([0.0, 0.0, 0.0]);
    }

    // 삼각형의 외적을 이용하여 면의 법선 벡터 계산
    for (var t = 0; t < idx.length; t += 3)
    {
        var i0 = idx[t];
        var i1 = idx[t + 1];
        var i2 = idx[t + 2];

        var u = subtract(p[i1], p[i0]);
        var v = subtract(p[i2], p[i0]);
        var triN = cross(u, v);             // 법선 벡터 계산

        // 인접한 삼각형의 법선 벡터를 정점에 누적
        n[i0] = add(n[i0], triN);
        n[i1] = add(n[i1], triN);
        n[i2] = add(n[i2], triN);
    }

    // 누적된 법선 벡터를 정규화
    for (var i = 0; i < n.length; i++)
    {
        n[i] = normalize(n[i]);
    }

    var points = [];
    var normals = [];
    var colors = [];

    // 정점 좌표, 법선 벡터, 색상 데이터 정렬
    for (var t = 0; t < idx.length; t++)
    {
        var index = idx[t];
        
        // 삼각형을 구성하는 정점 좌표, 법선 벡터 저장
        points.push(p[index][0], p[index][1], p[index][2]);
        normals.push(n[index][0], n[index][1], n[index][2]);
        colors.push(                            // 색상 저장
            mesh.vertexColors[index][0],
            mesh.vertexColors[index][1],
            mesh.vertexColors[index][2],
            mesh.vertexColors[index][3]
        );
    }

    // 각 정보 저장
    mesh.points = points;
    mesh.normals = normals;
    mesh.colors = colors;
}