"use strict";

var canvas;
var gl;
var program;
var mesh;
var vBuffer;                            // 정점 좌표 저장 버퍼
var nBuffer;                            // 법선 벡터 저장 버퍼
var cBuffer;                            // 정점 색상 저장 버퍼
var theta = 0.0;                        // 지구 자전 각도
var rotating = true;                    // 지구 자전 여부
var lightAngle = 0;                     // 광원 회전 각도
var movingLight = false;                // 조명 이동 여부
var scale = 24;                         // 고도 높낮이 표현 정도
var vPositionLoc;
var vNormalLoc;
var vColorLoc;
var modelViewMatrixLoc;
var projectionMatrixLoc;
var lightPositionLoc;

window.onload = function init()
{
    canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);

    if (!gl){ alert("WebGL isn't available"); }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // DEM 고도 데이터 복원
    var metres = unpackDEM();
    mesh = buildEarthMesh(metres, 60, 120);  // 지구 메시 생성, 60: 위도 구간 수, 120: 경도 구간 수
    updateTerrainGeometry(mesh, scale);

    // GPU 버퍼 생성 및 정점 속성과 연결
        // 정점 좌표 버퍼 생성 및 셰이더의 vPosition 속성과 연결
    vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(mesh.points), gl.STATIC_DRAW);
    vPositionLoc = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPositionLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPositionLoc);

        // 법선 벡터 버퍼 생성 및 셰이더의 vNormal 속성과 연결
    nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(mesh.normals), gl.STATIC_DRAW);
    vNormalLoc = gl.getAttribLocation(program, "vNormal");
    gl.vertexAttribPointer(vNormalLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormalLoc);

        // 정점 색상 버퍼 생성 및 셰이더의 vColor 속성과 연결
    cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(mesh.colors), gl.STATIC_DRAW);
    vColorLoc = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColorLoc, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColorLoc);

    // 조명 설정
    var ambientProduct = vec4(0.35, 0.35, 0.35, 1.0);
    var diffuseProduct = vec4(0.85, 0.85, 0.85, 1.0);
    var specularProduct = vec4(0.25, 0.25, 0.25, 1.0);

    // 조명 정보를 셰이더의 Uniform 변수에 전달
    gl.uniform4fv(gl.getUniformLocation(program, "ambientProduct"), flatten(ambientProduct));
    gl.uniform4fv(gl.getUniformLocation(program, "diffuseProduct"), flatten(diffuseProduct));
    gl.uniform4fv(gl.getUniformLocation(program, "specularProduct"), flatten(specularProduct));
    gl.uniform1f(gl.getUniformLocation(program, "shininess"), 20.0);

    // Uniform 변수 위치 저장
    modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");
    projectionMatrixLoc = gl.getUniformLocation(program, "projectionMatrix");
    lightPositionLoc = gl.getUniformLocation(program, "lightPosition");

    // 원근 투영 행렬 생성 및 셰이더에 전달
    var projectionMatrix = perspective(45.0, canvas.width / canvas.height, 0.1, 10.0);
    gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));

    // 이벤트 처리
    document.getElementById("rotBtn").onclick = function()  // 지구 자전 버튼
    {
        rotating = !rotating;
    };

    document.getElementById("lightBtn").onclick = function()  // 조명 이동 버튼
    {
        movingLight = !movingLight;
    };

    document.getElementById("lightSlider").oninput = function(e)  // 조명 각도 조절 슬라이더
    {
        lightAngle = Number(e.target.value);
        document.getElementById("lightVal").textContent = lightAngle;
    };
    render();
};

function render()
{
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);    // 버퍼 초기화

    // 지구 자전
    if (rotating)
    {
        theta = (theta + 0.5) % 360.0;      // 0.5도씩 자전
    }

    // 조명 이동
    if (movingLight)
    {
        lightAngle += 1.0;      // 1도씩 조명 이동

        if (lightAngle > 180.0)
            lightAngle -= 360.0;

        document.getElementById("lightSlider").value = lightAngle.toFixed(0);
        document.getElementById("lightVal").textContent = Math.round(lightAngle);
    }

    // 지구의 위치와 회전을 반영하는 모델 뷰 행렬 생성
    var modelViewMatrix = mult(translate(0.0, -0.15, -3.2), rotateY(theta));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(modelViewMatrix));

    // 광원 위치 계산
    var rad = radians(lightAngle);
    var lightPosition = vec4(Math.sin(rad), 0.4, Math.cos(rad), 0.0);
    gl.uniform4fv(lightPositionLoc, flatten(lightPosition));

    // 지구 렌더링
    gl.drawArrays(gl.TRIANGLES, 0, mesh.points.length / 3);

    requestAnimFrame(render);
}