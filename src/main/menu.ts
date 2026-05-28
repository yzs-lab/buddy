import { Menu, BrowserWindow, app } from 'electron'

export function setupMenu(mainWindow: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `关于 ${app.name}` },
        { type: 'separator' },
        {
          label: '偏好设置...',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('menu:action', 'openSettings')
        },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${app.name}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${app.name}` }
      ]
    },
    {
      label: '文件',
      submenu: [
        {
          label: '新建任务',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu:action', 'newTask')
        },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '上一个任务',
          accelerator: 'CmdOrCtrl+Shift+[',
          click: () => mainWindow.webContents.send('menu:action', 'prevTask')
        },
        {
          label: '下一个任务',
          accelerator: 'CmdOrCtrl+Shift+]',
          click: () => mainWindow.webContents.send('menu:action', 'nextTask')
        },
        { type: 'separator' },
        {
          label: '显示/隐藏任务栏',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('menu:action', 'toggleSidebar')
        },
        {
          label: '显示/隐藏状态栏',
          accelerator: 'CmdOrCtrl+Alt+B',
          click: () => mainWindow.webContents.send('menu:action', 'toggleStatusBar')
        },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' },
        { role: 'close', label: '关闭' }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
