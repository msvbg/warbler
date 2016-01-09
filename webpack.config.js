module.exports = {
    entry: './src/index.js',
    output: {
        path: __dirname + '/dist',
        filename: 'warbler.min.js',
        libraryTarget: 'umd'
    },
    module: {
        loaders: [
            {
                test: /\.jsx?$/,
                exclude: /(node_modules|bower_components)/,
                loader: 'babel' // 'babel-loader' is also a legal name to reference
            }
        ]
    }
};
