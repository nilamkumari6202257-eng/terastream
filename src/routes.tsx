import type { ReactNode } from 'react';
import { HomePage } from './pages/HomePage';
import { BrowsePage } from './pages/BrowsePage';
import { WatchPage } from './pages/WatchPage';
import { WaitPage } from './pages/WaitPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
export interface RouteConfig { name:string; path:string; element:ReactNode; visible?:boolean; public?:boolean; }
export const routes: RouteConfig[] = [
 {name:'Home',path:'/',element:<HomePage />,public:true}, {name:'Browse',path:'/browse',element:<BrowsePage />,public:true}, {name:'Watch',path:'/watch/:id',element:<WatchPage />,public:true}, {name:'Wait',path:'/wait/:id',element:<WaitPage />,public:true}, {name:'Watchlist',path:'/watchlist',element:<WatchlistPage />,public:true}, {name:'Admin Dashboard',path:'/admin/*',element:<AdminDashboard />,public:true},
];
