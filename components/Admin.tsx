
import React from 'react';

export const Admin: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-2xl font-bold text-slate-900">MongoDB-only configuration</h2>
      <p className="mt-4 text-sm text-slate-600">
        The legacy Google Sheets integration has been retired. The application now uses MongoDB Atlas as the only persistent source of business data.
      </p>
      <p className="mt-3 text-sm text-slate-600">
        This screen remains as a placeholder to keep the app structure clean and to prevent accidental reintroduction of obsolete spreadsheet sync code.
      </p>
    </div>
  );
};

export default Admin;
