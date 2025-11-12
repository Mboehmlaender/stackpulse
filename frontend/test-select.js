const React = require('react');
const { renderToString } = require('react-dom/server');
const { Select, Option } = require('@material-tailwind/react');
const element = React.createElement(Select, { value: 'a', onChange: ()=>{} },
  React.createElement(Option, { value: 'a' }, 'Alpha'),
  React.createElement(Option, { value: 'b' }, 'Beta')
);
console.log(renderToString(element));
