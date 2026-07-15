import test from 'node:test'
import assert from 'node:assert/strict'
import { groupTeamProfiles } from '../src/lib/teamProfiles.js'

const profiles = [
  { id: 'active', full_name: 'Active Waiter', email: 'waiter@example.com', status: 'active' },
  { id: 'disabled', full_name: 'Former Cashier', email: 'cashier@example.com', status: 'disabled' },
  { id: 'pending', full_name: 'New Applicant', email: 'new@example.com', status: 'pending' },
]

test('pending requests are separated from established team members', () => {
  const grouped = groupTeamProfiles(profiles)

  assert.deepEqual(grouped.members.map(profile => profile.id), ['active', 'disabled'])
  assert.deepEqual(grouped.pendingRequests.map(profile => profile.id), ['pending'])
})

test('team profile search applies to both member and pending sections', () => {
  assert.deepEqual(groupTeamProfiles(profiles, 'CASHIER').members.map(profile => profile.id), ['disabled'])
  assert.deepEqual(groupTeamProfiles(profiles, 'applicant').pendingRequests.map(profile => profile.id), ['pending'])
})

test('status filters show only their corresponding section', () => {
  assert.deepEqual(groupTeamProfiles(profiles, '', 'active'), {
    members: [profiles[0]],
    pendingRequests: [],
  })
  assert.deepEqual(groupTeamProfiles(profiles, '', 'disabled'), {
    members: [profiles[1]],
    pendingRequests: [],
  })
  assert.deepEqual(groupTeamProfiles(profiles, '', 'pending'), {
    members: [],
    pendingRequests: [profiles[2]],
  })
})
