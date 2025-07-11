export default {
  '/ws/list': () => {
    return {
      type: 'list',
      'data|30': [
        {
          key: '@guid', // 每次调用都会生成30个不同的key
          'id|+1': 0,
          name: '@title(1, 4)',
          time: '@datetime',
          protocol: '@protocol',
          pid: '@natural(1000, 99999)',
          tid: '@id',
          status: () => (Math.random() > 0.5 ? 'Active' : 'Inactive'),
          info: '@sentence(12, 100)',
        },
      ],
    };
  },
};
