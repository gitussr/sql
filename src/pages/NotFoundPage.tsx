import { Body1, Button, Title1 } from '@fluentui/react-components';
import { useNavigate } from 'react-router';
import { useDocumentTitle } from '../lib/utils/useDocumentTitle';
import { usePageStyles } from './pageStyles';

export function NotFoundPage() {
  const page = usePageStyles();
  const navigate = useNavigate();
  useDocumentTitle('Page not found');

  return (
    <header className={page.header}>
      <Title1 as="h1" className={page.title}>
        Page not found
      </Title1>
      <Body1 as="p" className={page.lead}>
        This page doesn't exist in the handbook. It may have moved, or the link may be mistyped.
      </Body1>
      <div className={page.actions}>
        <Button appearance="primary" onClick={() => navigate('/')}>
          Go to home
        </Button>
        <Button onClick={() => navigate('/chapters')}>Browse chapters</Button>
      </div>
    </header>
  );
}
