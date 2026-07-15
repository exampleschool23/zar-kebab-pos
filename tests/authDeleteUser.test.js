import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizeTeamMemberDeletion } from '../api/auth/delete-user.js'

const requester = {
  id: 'owner-id',
  email: 'owner@example.com',
  role: 'owner',
  status: 'active',
  feature_access: ['team'],
}

const target = {
  id: 'staff-id',
  email: 'staff@example.com',
  role: 'admin',
  status: 'active',
}

test('active owners with Team access can delete non-owner accounts', () => {
  assert.doesNotThrow(() => authorizeTeamMemberDeletion(requester, target, target.id))
})

test('team deletion rejects non-owners, inactive owners, and owners without Team access', () => {
  assert.throws(
    () => authorizeTeamMemberDeletion({ ...requester, role: 'admin' }, target, target.id),
    error => error.status === 403
  )
  assert.throws(
    () => authorizeTeamMemberDeletion({ ...requester, status: 'disabled' }, target, target.id),
    error => error.status === 403
  )
  assert.throws(
    () => authorizeTeamMemberDeletion({ ...requester, feature_access: ['dashboard'] }, target, target.id),
    error => error.status === 403
  )
})

test('team deletion protects self and every owner account', () => {
  assert.throws(
    () => authorizeTeamMemberDeletion(requester, { ...target, id: requester.id }, requester.id),
    error => error.status === 400
  )
  assert.throws(
    () => authorizeTeamMemberDeletion(requester, { ...target, role: 'owner' }, target.id),
    error => error.status === 403
  )
})

test('primary owner retains implicit Team deletion access', () => {
  const primaryOwner = {
    ...requester,
    email: 'dangerhoggish@gmail.com',
    feature_access: [],
  }
  assert.doesNotThrow(() => authorizeTeamMemberDeletion(primaryOwner, target, target.id))
})

test('bulk pending deletion cannot remove an account that was already approved', () => {
  assert.doesNotThrow(() => authorizeTeamMemberDeletion(
    requester,
    { ...target, status: 'pending' },
    target.id,
    'pending'
  ))
  assert.throws(
    () => authorizeTeamMemberDeletion(requester, target, target.id, 'pending'),
    error => error.status === 409
  )
})
