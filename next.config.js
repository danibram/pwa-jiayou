const withPWA = require('next-pwa');
const emoji = require('remark-emoji');
const withPlugins = require('next-compose-plugins');
const withMDX = require('@next/mdx')({
    extension: /\.(md|mdx)$/,
    options: {
        remarkPlugins: [emoji]
    }
});
const isProd = process.env.NODE_ENV !== 'development';

module.exports = withPlugins(
    [
        [
            withMDX,
            {
                pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx']
            }
        ],
        [
            withPWA,
            {
                pwa: {
                    disable: !isProd,
                    dest: 'public',
                    skipWaiting: false,
                    register: false
                }
            }
        ]
    ], {
        typescript: {
            ignoreDevErrors: true,
            ignoreBuildErrors: true
        }
    }
);