import { Architect } from '@angular-devkit/architect'
import { WorkspaceNodeModulesArchitectHost } from '@angular-devkit/architect/node'
import { TestingArchitectHost } from '@angular-devkit/architect/testing'
import { normalize, schema, workspaces } from '@angular-devkit/core'
import { NodeJsAsyncHost } from '@angular-devkit/core/node'
import * as path from 'path'

const workspaceRoot = path.resolve('__tests__', 'builders-app-v10')

// tslint:disable-next-line:no-big-function
describe('Devkit Builders - Angular version 10', () => {
  let testArchitectHost: TestingArchitectHost
  let architect: Architect

  beforeEach(async () => {
    const registry = new schema.CoreSchemaRegistry()
    registry.addPostTransform(schema.transforms.addUndefinedDefaults)

    const { workspace } = await workspaces.readWorkspace(normalize(workspaceRoot), workspaces.createWorkspaceHost(new NodeJsAsyncHost()))
    testArchitectHost = new TestingArchitectHost(
      workspaceRoot,
      workspaceRoot,
      new WorkspaceNodeModulesArchitectHost(workspace, workspaceRoot)
    )
    architect = new Architect(testArchitectHost, registry)
  })

  test('callbacks should be successfull', async () => {
    const run = await architect.scheduleTarget({ project: 'builders-app-v10', target: 'test-1' }, { verbose: true })
    const { success } = await run.result
    expect(success).toBe(true)
  }, 30000)

  test('callbacks should fail', async () => {
    const run = await architect.scheduleTarget({ project: 'builders-app-v10', target: 'test-2' }, { verbose: true })
    const { success } = await run.result
    expect(success).toBe(false)
  }, 30000)
})
