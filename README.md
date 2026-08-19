# Tile Planner

零建置依赖的浴室磁砖规划工具。页面可直接部署到任意静态主机；开发时建议通过 HTTP 服务开启，避免浏览器对 `file://` 的限制。

## 开发

```sh
python3 -m http.server 4173
```

然后打开 <http://127.0.0.1:4173/>。

运行 JavaScript 语法检查：

```sh
npm run check
```

## 目录结构

```text
index.html                 静态页面骨架与 SVG 挂载点
src/
  styles/
    tokens.css             颜色、圆角与明暗主题变量
    app.css                通用组件和绘图样式
    layout.css             仪表板、偏移控制与响应布局
    print.css              PDF / 浏览器打印版式
    responsive.css         触控设备与 iPad 适配
  js/
    core.js                状态、单位转换、几何与排砖算法
    plan.js                平面图渲染、拖拽与编辑交互
    views.js               编辑面板、墙面/纸盒视图和统计
    controls.js            表单同步、模式切换、JSON 导入导出
    export.js              PNG、SVG、PDF 导出
    bootstrap.js           偏移控件绑定与应用启动
```

脚本按上述顺序通过 `defer` 加载。各文件共享同一套应用状态，因此新增跨文件能力时应优先放在职责所属文件，并避免在启动完成前执行依赖后置文件的逻辑。

SVG 内部内容属于运行时视图，只保留空挂载点；不要把浏览器“另存页面”后的生成节点提交进源码。
