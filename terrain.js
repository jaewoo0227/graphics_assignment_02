
"use strict";

var EARTH_RADIUS_M = 6371000.0;


// DEM 데이터 변환
function unpackDEM()
{
    var binary = atob(DEM.packed);

    var bytes = Uint8Array.from(binary, function(c)
    {
        return c.charCodeAt(0);
    });

    var view = new DataView(bytes.buffer);

    var metres = new Float32Array(DEM.rows * DEM.cols);

    for (var i = 0; i < metres.length; i++)
    {
        metres[i] = view.getInt16(i * 2, true) * DEM.metresPerUnit;
    }

    return metres;
}


// 위도와 경도를 이용한 고도 추출
function getElevationFromDEM(metres, lat, lon)
{
    var r = Math.round((90.0 - lat) / DEM.step);
    var c = Math.round((lon + 180.0) / DEM.step);

    r = Math.max(0, Math.min(DEM.rows - 1, r));

    c = ((c % DEM.cols) + DEM.cols) % DEM.cols;

    return metres[r * DEM.cols + c];
}


// 고도에 따른 색상 지정
function elevationColor(h)
{
    if (h < -2000.0)
        return [0.10, 0.25, 0.55, 1.0];

    if (h < 0.0)
        return [0.20, 0.48, 0.80, 1.0];

    if (h < 1000.0)
        return [0.25, 0.65, 0.30, 1.0];

    if (h < 2800.0)
        return [0.65, 0.50, 0.30, 1.0];

    return [0.95, 0.95, 0.95, 1.0];
}


// 두 벡터의 차
function subtractVec3(a, b)
{
    return [
        a[0] - b[0],
        a[1] - b[1],
        a[2] - b[2]
    ];
}


// 두 벡터의 외적
function crossVec3(a, b)
{
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}


// 두 벡터의 합
function addVec3(a, b)
{
    return [
        a[0] + b[0],
        a[1] + b[1],
        a[2] + b[2]
    ];
}


// 지구 메시 생성
function buildEarthMesh(metres, latSeg, lonSeg)
{
    var radial = [];
    var heights = [];
    var colors = [];
    var indices = [];

    // 위도와 경도를 이용하여 정점 생성
    for (var i = 0; i <= latSeg; i++)
    {
        var lat = -90.0 + (i / latSeg) * 180.0;
        var phi = radians(lat);

        for (var j = 0; j <= lonSeg; j++)
        {
            var lon = -180.0 + (j / lonSeg) * 360.0;
            var theta = radians(lon);

            var h = getElevationFromDEM(metres, lat, lon);

            var x = Math.cos(phi) * Math.sin(theta);
            var y = Math.sin(phi);
            var z = Math.cos(phi) * Math.cos(theta);

            radial.push([x, y, z]);

            heights.push(h);
            colors.push(elevationColor(h));
        }
    }

    // 삼각형 인덱스 생성
    var stride = lonSeg + 1;

    for (var i = 0; i < latSeg; i++)
    {
        for (var j = 0; j < lonSeg; j++)
        {
            var a = i * stride + j;
            var b = a + 1;
            var c = (i + 1) * stride + j;
            var d = c + 1;

            indices.push(a, b, c);
            indices.push(b, d, c);
        }
    }

    return {
        radial: radial,
        heights: heights,
        colors: colors,
        indices: indices,

        positions: null,
        normals: null,
        vertexColors: null
    };
}


// 고도에 따른 지형 정점 및 법선 계산
function updateTerrainGeometry(mesh, scale)
{
    var p = [];
    var n = [];
    var idx = mesh.indices;

    // 고도에 따른 정점 위치 계산
    for (var i = 0; i < mesh.radial.length; i++)
    {
        var radius = 1.0 +
            (scale * mesh.heights[i]) / EARTH_RADIUS_M;

        p.push([
            radius * mesh.radial[i][0],
            radius * mesh.radial[i][1],
            radius * mesh.radial[i][2]
        ]);

        n.push([0.0, 0.0, 0.0]);
    }

    // 삼각형을 이용하여 법선 벡터 계산
    for (var t = 0; t < idx.length; t += 3)
    {
        var i0 = idx[t];
        var i1 = idx[t + 1];
        var i2 = idx[t + 2];

        var u = subtractVec3(p[i1], p[i0]);
        var v = subtractVec3(p[i2], p[i0]);

        var triN = crossVec3(u, v);

        n[i0] = addVec3(n[i0], triN);
        n[i1] = addVec3(n[i1], triN);
        n[i2] = addVec3(n[i2], triN);
    }

    // 법선 벡터 정규화
    for (var i = 0; i < n.length; i++)
    {
        n[i] = normalizeVec3(n[i]);
    }

    // drawArrays에 사용할 삼각형별 정점 배열 생성
    var positions = [];
    var normals = [];
    var vertexColors = [];

    for (var t = 0; t < idx.length; t++)
    {
        var index = idx[t];

        positions.push(
            p[index][0],
            p[index][1],
            p[index][2]
        );

        normals.push(
            n[index][0],
            n[index][1],
            n[index][2]
        );

        vertexColors.push(
            mesh.colors[index][0],
            mesh.colors[index][1],
            mesh.colors[index][2],
            mesh.colors[index][3]
        );
    }

    mesh.positions = new Float32Array(positions);
    mesh.normals = new Float32Array(normals);
    mesh.vertexColors = new Float32Array(vertexColors);
}
