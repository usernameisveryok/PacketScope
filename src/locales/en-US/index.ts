import monitor from './monitor';

export default {
  sideBar: 'side bar',
  content: 'socket list',
  win1: 'category information',
  win2: 'detail information',
  'sideBar.monitor': 'Monitor',
  'sideBar.guarder': 'Guarder',
  'sideBar.Locator': 'Locator',
  'fullScreen.exit': 'exit fullscreen',
  'fullScreen.enter': 'enter fullscreen',
  'Locator.howto':
    "To use this feature, enter the source address and destination address, then click the 'Trace Analysis' button. The routing path will be displayed on the map. The source address is optional and defaults to the host address.",
  'Locator.source': 'Source Address',
  'Locator.destination': 'Destination Address',
  'Locator.sourcePlaceholder': 'Please enter the source address',
  'Locator.destinationPlaceholder': 'Please enter the destination address',
  'Locator.startBtn': 'Start Tracing',
  'Locator.list': 'Routing Information List',
  'Locator.history': 'History',
  ...monitor,
};
