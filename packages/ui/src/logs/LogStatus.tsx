import type { Kernel } from '@kabel/core';
import { useLayoutEffect, useReducer } from 'preact/hooks';
import { useSelector } from '../hooks';
import { Icon } from '../icons/Icon';
import { cx } from '../utils';
import { recorderOf } from './logs-plugin';

const forceReducer = (n: number) => n + 1;

/** 日志记录变化时重新渲染 */
export function useLogRecorder(kernel: Kernel) {
  const recorder = recorderOf(kernel);
  const [, force] = useReducer(forceReducer, 0);
  useLayoutEffect(() => recorder.subscribe(() => force(0)), [recorder]);
  return recorder;
}

/** 状态栏右下角的日志按钮：显示条数，有未查看的错误时标红 */
export function LogStatus({ kernel }: { kernel: Kernel }) {
  const recorder = useLogRecorder(kernel);
  const open = useSelector((s) => !!s.logs?.open);
  const count = recorder.list().length;
  const errors = recorder.unseenErrors;
  return (
    <button
      type="button"
      class={cx('kb-statusbar__item', 'is-action', 'kb-log-status', open && 'is-active', errors > 0 && 'is-danger')}
      title={errors > 0 ? `日志（${errors} 条新错误）` : '日志'}
      aria-pressed={open}
      onClick={() => void kernel.execute('logs.toggle')}
    >
      <Icon name="log" />
      <span>日志</span>
      {count > 0 && <span class="kb-log-status__count">{count > 999 ? '999+' : count}</span>}
    </button>
  );
}
