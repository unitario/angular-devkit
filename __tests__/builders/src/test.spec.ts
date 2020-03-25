import { Architect, Target } from '@angular-devkit/architect'
import { WorkspaceNodeModulesArchitectHost } from '@angular-devkit/architect/node'
import { TestingArchitectHost } from '@angular-devkit/architect/testing'
import { logging, normalize, schema, workspaces } from '@angular-devkit/core'
import { NodeJsAsyncHost } from '@angular-devkit/core/node'
import * as path from 'path'

const workspaceRoot = path.resolve('__tests__', 'builders-app')

// tslint:disable-next-line:no-big-function
describe('Devkit Builders', () => {
  // const filesWithErrors = { 'src/foo.ts': 'const foo = "";\n' };
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
    const run = await architect.scheduleTarget({ project: 'builders-app', target: 'test-1' }, { verbose: true })
    const { success } = await run.result
    expect(success).toBe(true)
  }, 30000)

  test('callbacks should fail', async () => {
    const run = await architect.scheduleTarget({ project: 'builders-app', target: 'test-2' }, { verbose: true })
    const { success } = await run.result
    expect(success).toBe(false)
  }, 30000)
})
