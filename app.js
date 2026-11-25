
"use strict";

var canvas;
var gl;
var program;

var mesh;

var positionBuffer;
var normalBuffer;
var colorBuffer;

var rotAngle = 0.0;
var rotating = true;

var lightAngle = -35.0;
var movingLight = false;

var scale = 24;
var needUpdate = true;

var positionLoc;
var normalLoc;
var colorLoc;

var modelViewLoc;
var projectionLoc;
var lightPositionLoc;

// 초기화
window.onload = function init()
{
    canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);

    if (!gl)
    {
        alert("WebGL isn't available");
        return;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.95, 0.95, 0.95, 1.0);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // DEM 데이터 읽기
    var metres = unpackDEM();

    // 지구 메시 생성
    mesh = buildEarthMesh(metres, 60, 120);

    updateTerrainGeometry(mesh, scale);

    // Position Buffer
    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);

    positionLoc = gl.getAttribLocation(program, "aPosition");
    gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionLoc);

    // Normal Buffer
    normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW);

    normalLoc = gl.getAttribLocation(program, "aNormal");
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(normalLoc);

    // Color Buffer
    colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertexColors, gl.STATIC_DRAW);

    colorLoc = gl.getAttribLocation(program, "aColor");
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(colorLoc);

    // 조명 설정
    var ambientProduct = vec4(0.35, 0.35, 0.35, 1.0);
    var diffuseProduct = vec4(0.85, 0.85, 0.85, 1.0);
    var specularProduct = vec4(0.25, 0.25, 0.25, 1.0);

    gl.uniform4fv(
        gl.getUniformLocation(program, "ambientProduct"),
        flatten(ambientProduct)
    );

    gl.uniform4fv(
        gl.getUniformLocation(program, "diffuseProduct"),
        flatten(diffuseProduct)
    );

    gl.uniform4fv(
        gl.getUniformLocation(program, "specularProduct"),
        flatten(specularProduct)
    );

    gl.uniform1f(
        gl.getUniformLocation(program, "shininess"),
        20.0
    );

    // 행렬 위치
    modelViewLoc = gl.getUniformLocation(program, "modelViewMatrix");
    projectionLoc = gl.getUniformLocation(program, "projectionMatrix");
    lightPositionLoc = gl.getUniformLocation(program, "lightPosition");

    // Projection Matrix
    var projectionMatrix = createPerspective(
        45.0,
        canvas.width / canvas.height,
        0.1,
        10.0
    );

    gl.uniformMatrix4fv(
        projectionLoc,
        false,
        projectionMatrix
    );

    // 버튼 이벤트
    document.getElementById("rotBtn").onclick = function()
    {
        rotating = !rotating;
    };

    document.getElementById("lightBtn").onclick = function()
    {
        movingLight = !movingLight;
    };

    // 고도 배율
    document.getElementById("scaleSlider").oninput = function(e)
    {
        scale = Number(e.target.value);

        document.getElementById("scaleVal").textContent = scale;

        needUpdate = true;
    };

    // 조명 각도
    document.getElementById("lightSlider").oninput = function(e)
    {
        lightAngle = Number(e.target.value);

        document.getElementById("lightVal").textContent = lightAngle;
    };

    render();
};


// 화면 출력
function render()
{
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 지구 자전
    if (rotating)
    {
        rotAngle = (rotAngle + 0.5) % 360.0;
    }

    // 조명 이동
    if (movingLight)
    {
        lightAngle += 0.8;

        if (lightAngle > 180.0)
            lightAngle -= 360.0;

        document.getElementById("lightSlider").value = lightAngle.toFixed(0);
        document.getElementById("lightVal").textContent = Math.round(lightAngle);
    }

    // 지형 갱신
    if (needUpdate)
    {
        updateTerrainGeometry(mesh, scale);

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.positions);

        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.normals);

        needUpdate = false;
    }

    // Model View Matrix
    var modelViewMatrix = createTranslateRotateY(rotAngle);

    gl.uniformMatrix4fv(
        modelViewLoc,
        false,
        modelViewMatrix
    );

    // 조명 위치
    var rad = radians(lightAngle);

    var lightPosition = vec4(
        Math.sin(rad),
        0.4,
        Math.cos(rad),
        0.0
    );

    gl.uniform4fv(
        lightPositionLoc,
        flatten(lightPosition)
    );

    // 지구 그리기
    gl.drawArrays(
        gl.TRIANGLES,
        0,
        mesh.positions.length / 3
    );

    requestAnimationFrame(render);
}


// 정규화
function normalizeVec3(v)
{
    var len = Math.sqrt(
        v[0] * v[0] +
        v[1] * v[1] +
        v[2] * v[2]
    );

    if (len === 0.0)
        return [0.0, 0.0, 0.0];

    return [
        v[0] / len,
        v[1] / len,
        v[2] / len
    ];
}


// Perspective Matrix
function createPerspective(fovy, aspect, near, far)
{
    var f = 1.0 / Math.tan(radians(fovy) / 2.0);

    var result = new Float32Array(16);

    result[0] = f / aspect;
    result[5] = f;
    result[10] = (far + near) / (near - far);
    result[11] = -1.0;
    result[14] = (2.0 * far * near) / (near - far);

    return result;
}


// Translation + Y Rotation Matrix
function createTranslateRotateY(angle)
{
    var c = Math.cos(radians(angle));
    var s = Math.sin(radians(angle));

    return new Float32Array([
         c, 0.0, -s, 0.0,
         0.0, 1.0, 0.0, 0.0,
         s, 0.0, c, 0.0,
         0.0, -0.15, -3.2, 1.0
    ]);
}
