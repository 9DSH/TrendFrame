import { Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import { Page } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Topics from './pages/Topics.jsx';
import Analytics from './pages/Analytics.jsx';
import Collection from './pages/Collection.jsx';
import Analysis from './pages/Analysis.jsx';
import Research from './pages/Research.jsx';
import Ideas from './pages/Ideas.jsx';
import Channels from './pages/Channels.jsx';
import Settings from './pages/Settings.jsx';
import Projects from './pages/Projects.jsx';
import Football from './pages/Football.jsx';

export default function App() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 p-5">
        <div className="mx-auto max-w-7xl">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/collection" element={<Page title="Collection" subtitle="Fetch videos and build snapshot history"><Collection /></Page>} />
            <Route path="/scoring" element={<Page title="Scoring & settings" subtitle="Weights, analysis controls and AI naming"><Analysis /></Page>} />
            <Route path="/topics" element={<Topics />} />
            <Route path="/analytics/:id?" element={<Analytics />} />
            <Route path="/research/:id?" element={<Research />} />
            <Route path="/ideas/:id?" element={<Ideas />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/projects/:id?" element={<Projects />} />
            <Route path="/football" element={<Football />} />
            <Route path="*" element={<p className="text-slate-400">Page not found.</p>} />
          </Routes>
        </div>
      </main>
    </div>
  );
}