import React from 'react';
import { renderToString } from 'react-dom/server';
import pkg from '@material-tailwind/react';
const { Select, Option } = pkg;

const element = React.createElement(Select, {
  label: 'Test',
  value: 'b',
  selected: (el) => el?.props.children,
  onChange: () => {},
  children: [
    React.createElement(Option, { key: 'a', value: 'a' }, 'Alpha'),
    React.createElement(Option, { key: 'b', value: 'b' }, 'Beta')
  ]
});

console.log(renderToString(element));
