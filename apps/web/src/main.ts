import { inject } from '@vercel/analytics';
import { mount } from 'svelte';
import App from './ui/App.svelte';
import './ui/global.css';

// Initialize Vercel Web Analytics
inject();

mount(App, { target: document.getElementById('app')! });
