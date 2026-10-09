import React from 'react';
import { Project } from '../../types/project.js';
import { Users, Mail, Phone, Shield } from 'lucide-react';

export interface ProjectTeamSectionProps {
  project: Project;
}

export const ProjectTeamSection: React.FC<ProjectTeamSectionProps> = ({ project }) => {
  const teamMembers = project.teamMembers || [];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-bold text-slate-900 font-heading">
                Assigned Team Members
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {teamMembers.length} {teamMembers.length === 1 ? 'Member' : 'Members'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Team members allocated to work on and deliver this project.
            </p>
          </div>
        </div>
      </div>

      {/* Member Cards Grid */}
      {teamMembers.length === 0 ? (
        <div className="py-10 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500 mx-auto mb-2.5">
            <Users className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No team members assigned</h4>
          <p className="text-xs text-slate-500 mt-0.5 max-w-sm mx-auto">
            Team members assigned to this project will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {teamMembers.map((member) => {
            const user = member.user;
            const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Team Member';
            const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'TM';

            return (
              <div
                key={member.id}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-xs transition-all flex items-start gap-3.5 group"
              >
                {/* Avatar */}
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={fullName}
                    className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#070F2B] to-[#1B1A55] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                    {initials}
                  </div>
                )}

                {/* Details */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                      {fullName}
                    </h4>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/80 shrink-0">
                      <Shield className="w-2.5 h-2.5 text-slate-500" />
                      {member.role === 'OWNER' ? 'Owner' : 'Member'}
                    </span>
                  </div>

                  {user.email && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
                      <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                      <a
                        href={`mailto:${user.email}`}
                        className="hover:text-blue-600 truncate transition-colors"
                        title={user.email}
                      >
                        {user.email}
                      </a>
                    </div>
                  )}

                  {user.phone && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <a
                        href={`tel:${user.phone}`}
                        className="hover:text-blue-600 truncate transition-colors"
                        title={user.phone}
                      >
                        {user.phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
