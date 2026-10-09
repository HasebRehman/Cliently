import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button.js';
import { FileQuestion } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-3xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mb-6 shadow-md">
        <FileQuestion className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">404 - Page Not Found</h1>
      <p className="text-xs text-slate-500 font-medium max-w-sm mb-6 leading-relaxed">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link to="/dashboard">
        <Button variant="primary" size="md">
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
};
