const path = require('path');

module.exports = {
  entry: './populate-db.js',
  target: 'node',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: 'babel-loader',
        exclude: /node_modules/,
      },
    ],
  },
  output: {
    filename: 'populate-db.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'commonjs2',
  },
  optimization: {
    minimize: false,
  },
};
